import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Building2,
  ChevronLeft,
  Download,
  Landmark,
  Loader2,
  Smartphone,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { Button, Glass, SegmentedControl } from 'glisse';
import { useAuth } from '@/app/providers/AuthProvider';
import { useSnackbar } from '@/app/providers/SnackbarProvider';
import { exportFinancialReportExcel } from '@/data/sync/backupRestoreService';
import {
  FirestoreAccountRepository,
  FirestoreObligationRepository,
  FirestorePaymentRepository,
  FirestoreProjectRepository,
  FirestoreTransactionRepository,
} from '@/data/repositories/firestore';
import { Account, Obligation, Payment, Project, Transaction } from '@/domain/entities';
import { Money } from '@/domain/accounting/money';
import { BudgetAlertLevel } from '@/domain/accounting/dashboardAnalytics';
import { ReportPeriod, computeFinancialReports } from '@/domain/accounting/financialReports';
import { registerMemoryCacheClearer } from '@/data/sync/dataWipeService';

const accountRepo = new FirestoreAccountRepository();
const transactionRepo = new FirestoreTransactionRepository();
const projectRepo = new FirestoreProjectRepository();
const obligationRepo = new FirestoreObligationRepository();
const paymentRepo = new FirestorePaymentRepository();

interface CachedReportsState {
  userId: string;
  accounts: Account[];
  transactions: Transaction[];
  projects: Project[];
  obligations: Obligation[];
  payments: Payment[];
}

let cachedReports: CachedReportsState | null = null;
registerMemoryCacheClearer(() => {
  cachedReports = null;
});

type ReportTab = 'pnl' | 'cashflow' | 'projects';

const PERIOD_OPTIONS: Array<{ value: ReportPeriod; label: string }> = [
  { value: 'all', label: 'All Time' },
  { value: 'month', label: 'This Month' },
  { value: 'quarter', label: 'This Quarter' },
  { value: 'year', label: 'This Year' },
];

const ALERT_BAR_CLASSES: Record<BudgetAlertLevel, string> = {
  healthy: 'bg-blue-500',
  warning: 'bg-amber-500',
  critical: 'bg-orange-500',
  over: 'bg-rose-500',
};

const ALERT_TEXT_CLASSES: Record<BudgetAlertLevel, string> = {
  healthy: 'text-[var(--lg-muted)]',
  warning: 'text-amber-600 dark:text-amber-400',
  critical: 'text-orange-600 dark:text-orange-400',
  over: 'text-rose-600 dark:text-rose-400',
};

interface FinancialReportsViewProps {
  onBack: () => void;
}

export const FinancialReportsView: React.FC<FinancialReportsViewProps> = ({ onBack }) => {
  const { user } = useAuth();
  const { showSnackbar } = useSnackbar();
  const userId = user?.uid || 'guest-user';

  const hasWarmCache = Boolean(cachedReports && cachedReports.userId === userId);
  const [activeTab, setActiveTab] = useState<ReportTab>('pnl');
  const [period, setPeriod] = useState<ReportPeriod>('all');
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const periodRowRef = useRef<HTMLDivElement>(null);
  const periodChipRefs = useRef<Map<ReportPeriod, HTMLButtonElement>>(new Map());

  useEffect(() => {
    const row = periodRowRef.current;
    const chip = periodChipRefs.current.get(period);
    if (!row || !chip) return;
    const targetLeft = Math.max(0, chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2);
    if (typeof row.scrollTo === 'function') {
      row.scrollTo({ left: targetLeft, behavior: 'smooth' });
    } else {
      row.scrollLeft = targetLeft;
    }
  }, [period]);

  const [accounts, setAccounts] = useState<Account[]>(() =>
    hasWarmCache ? cachedReports!.accounts : []
  );
  const [transactions, setTransactions] = useState<Transaction[]>(() =>
    hasWarmCache ? cachedReports!.transactions : []
  );
  const [projects, setProjects] = useState<Project[]>(() =>
    hasWarmCache ? cachedReports!.projects : []
  );
  const [obligations, setObligations] = useState<Obligation[]>(() =>
    hasWarmCache ? cachedReports!.obligations : []
  );
  const [payments, setPayments] = useState<Payment[]>(() =>
    hasWarmCache ? cachedReports!.payments : []
  );
  const [loading, setLoading] = useState<boolean>(() => !hasWarmCache);

  useEffect(() => {
    const ensureCache = (): CachedReportsState => {
      if (!cachedReports || cachedReports.userId !== userId) {
        cachedReports = {
          userId,
          accounts: [],
          transactions: [],
          projects: [],
          obligations: [],
          payments: [],
        };
      }
      return cachedReports;
    };

    const unsubs: Array<() => void> = [];

    if (accountRepo.subscribe) {
      unsubs.push(
        accountRepo.subscribe(
          userId,
          (accs) => {
            setAccounts(accs);
            ensureCache().accounts = accs;
          },
          (err) => console.warn('[Reports] Account subscribe:', err)
        )
      );
    }

    if (transactionRepo.subscribe) {
      unsubs.push(
        transactionRepo.subscribe(
          userId,
          (txs) => {
            setTransactions(txs);
            ensureCache().transactions = txs;
            setLoading(false);
          },
          (err) => {
            console.warn('[Reports] Transaction subscribe:', err);
            setLoading(false);
          }
        )
      );
    }

    unsubs.push(
      projectRepo.subscribe(
        userId,
        (prjs) => {
          setProjects(prjs);
          ensureCache().projects = prjs;
        },
        (err) => console.warn('[Reports] Project subscribe:', err)
      )
    );

    unsubs.push(
      obligationRepo.subscribe(
        userId,
        (obls) => {
          setObligations(obls);
          ensureCache().obligations = obls;
        },
        (err) => console.warn('[Reports] Obligation subscribe:', err)
      )
    );

    unsubs.push(
      paymentRepo.subscribe(
        userId,
        (pays) => {
          setPayments(pays);
          ensureCache().payments = pays;
        },
        (err) => console.warn('[Reports] Payment subscribe:', err)
      )
    );

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [userId]);

  const report = useMemo(
    () =>
      computeFinancialReports({
        accounts,
        projects,
        transactions,
        obligations,
        payments,
        period,
      }),
    [accounts, projects, transactions, obligations, payments, period]
  );

  const handleExportReport = async () => {
    if (!user?.uid || isExporting) return;
    setIsExporting(true);
    try {
      const { outcome } = await exportFinancialReportExcel(user.uid, period);
      if (outcome === 'shared') {
        showSnackbar({ message: 'Financial report shared.', tone: 'success' });
      } else if (outcome === 'downloaded') {
        showSnackbar({ message: 'Financial report downloaded.', tone: 'success' });
      }
    } catch (error) {
      console.error('[Reports] Excel export failed:', error);
      showSnackbar({
        message: 'Could not export financial report. Please try again.',
        tone: 'error',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const accountIcon = (type: Account['type']) => {
    switch (type) {
      case 'cash':
        return <Wallet className="w-3.5 h-3.5 text-emerald-500" />;
      case 'bank':
        return <Landmark className="w-3.5 h-3.5 text-blue-500" />;
      case 'mobile_wallet':
        return <Smartphone className="w-3.5 h-3.5 text-violet-500" />;
      default:
        return <Wallet className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  return (
    <div className="flex flex-col app-screen w-full bg-[#E2DDD5] dark:bg-background text-slate-900 dark:text-slate-100 overflow-hidden font-sans transition-colors duration-200">
      {/* Standalone scrollable screen: status-bar spacer + header scroll cleanly with content */}
      <div className="flex-1 overflow-y-auto scroll-container overscroll-y-contain">
        <div
          className="w-full select-none pointer-events-none"
          style={{ height: 'var(--top-spacer, env(safe-area-inset-top, 0px))' }}
        />

        <header className="w-full px-4 py-2.5 flex items-center justify-between gap-3 select-none">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="glass"
              aria-label="Go back"
              onClick={onBack}
              icon={<ChevronLeft className="!w-6 !h-6" />}
              className="!p-0 !rounded-full !w-[44px] !h-[44px] flex-shrink-0"
            />
            <div className="min-w-0">
              <h1 className="text-xl font-extrabold text-[var(--lg-foreground)] tracking-tight truncate">
                Financial Reports
              </h1>
              <p className="text-[11px] font-medium text-[var(--lg-muted)] truncate">
                {report.periodRangeLabel}
              </p>
            </div>
          </div>

          <Button
            variant="glass"
            aria-label="Export Financial Report Excel"
            onClick={handleExportReport}
            disabled={isExporting}
            icon={
              isExporting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Download className="w-5 h-5" />
              )
            }
            className="!p-0 !rounded-full !w-[44px] !h-[44px] flex-shrink-0"
          />
        </header>

        <main className="max-w-md mx-auto w-full px-4 pt-2 pb-12 space-y-5">
          {/* Glisse Segmented Control: P&L | Cash Flow | Projects */}
          <div className="flex justify-center w-full">
            <SegmentedControl
              items={[
                { value: 'pnl', label: 'P&L' },
                { value: 'cashflow', label: 'Cash Flow' },
                { value: 'projects', label: 'Projects' },
              ]}
              value={activeTab}
              onValueChange={(val) => {
                if (val) setActiveTab(val as ReportTab);
              }}
              style={{
                '--lg-tab-width': 'calc((min(100vw - 2rem, 28rem) - 8px) / 3)',
                '--lg-tab-height': '38px',
              } as React.CSSProperties}
            />
          </div>

          {/* Period Chips */}
          <div
            ref={periodRowRef}
            className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5"
          >
            {PERIOD_OPTIONS.map((opt) => {
              const active = period === opt.value;
              return (
                <button
                  key={opt.value}
                  ref={(el) => {
                    if (el) periodChipRefs.current.set(opt.value, el);
                    else periodChipRefs.current.delete(opt.value);
                  }}
                  type="button"
                  onClick={() => setPeriod(opt.value)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0 ${
                    active
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/25'
                      : 'bg-[var(--lg-glass)] text-[var(--lg-muted)] border border-[var(--lg-edge)] hover:text-[var(--lg-foreground)]'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {loading ? (
            <div className="space-y-4 animate-pulse pt-2">
              <div className="h-36 rounded-3xl bg-[var(--lg-muted)]/15" />
              <div className="h-24 rounded-2xl bg-[var(--lg-muted)]/10" />
              <div className="h-24 rounded-2xl bg-[var(--lg-muted)]/10" />
            </div>
          ) : activeTab === 'pnl' ? (
            /* ================= PROFIT & LOSS (ACCRUAL) ================= */
            <div className="space-y-6">
              <Glass className="p-5 rounded-3xl space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--lg-muted)]">
                      Net Profit / Loss
                    </p>
                    <p
                      className={`text-2xl sm:text-3xl font-black tracking-tight tabular-nums mt-1 ${
                        report.pnl.netProfitMinor >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {report.pnl.netProfitMinor > 0 ? '+' : ''}
                      {Money.format(report.pnl.netProfitMinor)}
                    </p>
                  </div>
                  {report.pnl.profitMarginPct !== null && (
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold tabular-nums whitespace-nowrap flex-shrink-0 ${
                        report.pnl.profitMarginPct >= 0
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                          : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                      }`}
                    >
                      {report.pnl.profitMarginPct >= 0 ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : (
                        <TrendingDown className="w-3 h-3" />
                      )}
                      {report.pnl.profitMarginPct}% margin
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="rounded-2xl px-3.5 py-2.5 bg-emerald-500/10">
                    <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                      <ArrowDownLeft className="w-3 h-3" />
                      Total Income
                    </div>
                    <p className="text-sm font-extrabold tabular-nums text-[var(--lg-foreground)] mt-1">
                      {Money.format(report.pnl.totalIncomeMinor)}
                    </p>
                  </div>

                  <div className="rounded-2xl px-3.5 py-2.5 bg-rose-500/10">
                    <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-300">
                      <ArrowUpRight className="w-3 h-3" />
                      Total Expenses
                    </div>
                    <p className="text-sm font-extrabold tabular-nums text-[var(--lg-foreground)] mt-1">
                      {Money.format(report.pnl.totalExpenseMinor)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-[var(--lg-muted)] tabular-nums">
                  <span>Direct: {Money.format(report.pnl.directExpenseMinor)}</span>
                  <span>Bills Incurred: {Money.format(report.pnl.billsIncurredMinor)}</span>
                </div>
              </Glass>

              {/* Revenue Breakdown */}
              <section className="pb-5 border-b border-[var(--lg-separator)] space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-bold tracking-wider text-[var(--lg-muted)] uppercase">
                    Income Breakdown
                  </h2>
                  <span className="text-xs font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {Money.format(report.pnl.totalIncomeMinor)}
                  </span>
                </div>

                {report.pnl.incomeLines.length === 0 ? (
                  <p className="text-xs text-[var(--lg-muted)]">
                    No income recorded for {report.periodLabel.toLowerCase()}.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {report.pnl.incomeLines.map((line) => (
                      <div key={line.key} className="space-y-1">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-semibold text-[var(--lg-foreground)] truncate">
                            {line.label}
                          </span>
                          <div className="flex items-center gap-2 flex-shrink-0 tabular-nums">
                            <span className="text-[11px] text-[var(--lg-muted)]">
                              {line.sharePct}%
                            </span>
                            <span className="font-bold text-emerald-600 dark:text-emerald-400">
                              {Money.format(line.amountMinor)}
                            </span>
                          </div>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-[var(--lg-separator)] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-emerald-500"
                            style={{ width: `${Math.min(100, line.sharePct)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Expense Breakdown */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-bold tracking-wider text-[var(--lg-muted)] uppercase">
                    Expense Breakdown (Accrual)
                  </h2>
                  <span className="text-xs font-bold tabular-nums text-rose-600 dark:text-rose-400">
                    {Money.format(report.pnl.totalExpenseMinor)}
                  </span>
                </div>

                {report.pnl.expenseLines.length === 0 ? (
                  <p className="text-xs text-[var(--lg-muted)]">
                    No expenses or bills recorded for {report.periodLabel.toLowerCase()}.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {report.pnl.expenseLines.map((line) => (
                      <div key={line.key} className="space-y-1">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-semibold text-[var(--lg-foreground)] truncate">
                              {line.label}
                            </span>
                            <span className="text-[10px] text-[var(--lg-muted)] flex-shrink-0">
                              ({line.count})
                            </span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0 tabular-nums">
                            <span className="text-[11px] text-[var(--lg-muted)]">
                              {line.sharePct}%
                            </span>
                            <span className="font-bold text-[var(--lg-foreground)]">
                              {Money.format(line.amountMinor)}
                            </span>
                          </div>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-[var(--lg-separator)] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-rose-500"
                            style={{ width: `${Math.min(100, line.sharePct)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-[11px] text-[var(--lg-muted)] pt-2">
                  Accrual basis: payable bills count when incurred; outgoing bill payments and internal transfers are excluded to prevent double-counting.
                </p>
              </section>
            </div>
          ) : activeTab === 'cashflow' ? (
            /* ================= CASH FLOW STATEMENT ================= */
            <div className="space-y-6">
              <Glass className="p-5 rounded-3xl space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--lg-muted)]">
                      Net Cash Movement
                    </p>
                    <p
                      className={`text-2xl sm:text-3xl font-black tracking-tight tabular-nums mt-1 ${
                        report.cashFlow.netCashFlowMinor >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {report.cashFlow.netCashFlowMinor > 0 ? '+' : ''}
                      {Money.format(report.cashFlow.netCashFlowMinor)}
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-bold tabular-nums whitespace-nowrap flex-shrink-0 bg-[var(--lg-glass)] border border-[var(--lg-edge)] text-[var(--lg-foreground)]">
                    Cash {Money.format(report.cashFlow.closingCashMinor)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="rounded-2xl px-3.5 py-2.5 bg-emerald-500/10">
                    <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                      <ArrowDownLeft className="w-3 h-3" />
                      Cash In
                    </div>
                    <p className="text-sm font-extrabold tabular-nums text-[var(--lg-foreground)] mt-1">
                      {Money.format(report.cashFlow.totalCashInMinor)}
                    </p>
                  </div>

                  <div className="rounded-2xl px-3.5 py-2.5 bg-rose-500/10">
                    <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-300">
                      <ArrowUpRight className="w-3 h-3" />
                      Cash Out
                    </div>
                    <p className="text-sm font-extrabold tabular-nums text-[var(--lg-foreground)] mt-1">
                      {Money.format(report.cashFlow.totalCashOutMinor)}
                    </p>
                  </div>
                </div>

                {report.cashFlow.transferCount > 0 && (
                  <div className="flex items-center justify-between text-[11px] text-[var(--lg-muted)] tabular-nums">
                    <span className="inline-flex items-center gap-1">
                      <ArrowLeftRight className="w-3 h-3 text-blue-500" />
                      Internal Transfers ({report.cashFlow.transferCount})
                    </span>
                    <span className="font-semibold text-[var(--lg-foreground)]">
                      {Money.format(report.cashFlow.transferVolumeMinor)} (net 0)
                    </span>
                  </div>
                )}
              </Glass>

              {/* Cash Flow by Account */}
              <section className="space-y-3">
                <h2 className="text-xs font-bold tracking-wider text-[var(--lg-muted)] uppercase">
                  Activity by Account
                </h2>

                {report.cashFlow.byAccount.length === 0 ? (
                  <p className="text-xs text-[var(--lg-muted)]">No active accounts found.</p>
                ) : (
                  <div className="space-y-3">
                    {report.cashFlow.byAccount.map((acc) => (
                      <div
                        key={acc.accountId}
                        className="pb-3 border-b border-[var(--lg-separator)] last:border-b-0 space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {accountIcon(acc.accountType)}
                            <span className="text-xs font-bold text-[var(--lg-foreground)] truncate">
                              {acc.accountName}
                            </span>
                          </div>
                          <span className="text-xs font-extrabold tabular-nums text-[var(--lg-foreground)]">
                            {Money.format(acc.currentBalanceMinor)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] tabular-nums">
                          <span className="text-emerald-600 dark:text-emerald-400">
                            In +{Money.format(acc.cashInMinor)}
                          </span>
                          <span className="text-rose-600 dark:text-rose-400">
                            Out -{Money.format(acc.cashOutMinor)}
                          </span>
                          <span
                            className={`font-bold ${
                              acc.netChangeMinor >= 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            Net {acc.netChangeMinor >= 0 ? '+' : ''}
                            {Money.format(acc.netChangeMinor)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-[11px] text-[var(--lg-muted)] pt-1">
                  Cash basis: includes actual cash expenses, income, and bill payments. Unpaid bills do not reduce cash until paid.
                </p>
              </section>
            </div>
          ) : (
            /* ================= PROJECT COST COMPARISONS ================= */
            <div className="space-y-6">
              <Glass className="p-5 rounded-3xl space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--lg-muted)]">
                      Portfolio Spend ({report.periodLabel})
                    </p>
                    <p className="text-2xl sm:text-3xl font-black tracking-tight tabular-nums text-[var(--lg-foreground)] mt-1">
                      {Money.format(report.projectComparison.totalSpentMinor)}
                    </p>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold tabular-nums whitespace-nowrap flex-shrink-0 ${
                      report.projectComparison.overallUtilizationPct >= 100
                        ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                        : report.projectComparison.overallUtilizationPct >= 80
                          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                          : 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                    }`}
                  >
                    {report.projectComparison.overallUtilizationPct}% of budget
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="rounded-2xl px-3.5 py-2.5 bg-blue-500/10">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                      Combined Budget
                    </p>
                    <p className="text-sm font-extrabold tabular-nums text-[var(--lg-foreground)] mt-1">
                      {Money.format(report.projectComparison.totalBudgetMinor)}
                    </p>
                  </div>

                  <div className="rounded-2xl px-3.5 py-2.5 bg-slate-500/10">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--lg-muted)]">
                      {report.projectComparison.totalRemainingMinor >= 0 ? 'Remaining' : 'Over Budget'}
                    </p>
                    <p
                      className={`text-sm font-extrabold tabular-nums mt-1 ${
                        report.projectComparison.totalRemainingMinor >= 0
                          ? 'text-[var(--lg-foreground)]'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {Money.format(Math.abs(report.projectComparison.totalRemainingMinor))}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-[var(--lg-muted)] tabular-nums">
                  <span>Direct: {Money.format(report.projectComparison.totalDirectMinor)}</span>
                  <span>Bills: {Money.format(report.projectComparison.totalBillsMinor)}</span>
                </div>
              </Glass>

              {/* Side-by-side Project Comparison List */}
              <section className="space-y-3">
                <h2 className="text-xs font-bold tracking-wider text-[var(--lg-muted)] uppercase">
                  Project Cost Breakdown ({report.projectComparison.rows.length})
                </h2>

                {report.projectComparison.rows.length === 0 ? (
                  <div className="py-6 text-center space-y-1.5">
                    <Building2 className="w-7 h-7 mx-auto text-[var(--lg-muted)] opacity-60" />
                    <p className="text-xs text-[var(--lg-muted)]">
                      No active projects to compare yet.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {report.projectComparison.rows.map((prj) => (
                      <div
                        key={prj.projectId}
                        className="pb-4 border-b border-[var(--lg-separator)] last:border-b-0 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-bold text-[var(--lg-foreground)] truncate">
                            {prj.projectName}
                          </span>
                          <span
                            className={`font-bold tabular-nums flex-shrink-0 ${ALERT_TEXT_CLASSES[prj.alertLevel]}`}
                          >
                            {prj.utilizationPct}%
                          </span>
                        </div>

                        <div className="w-full h-1.5 rounded-full bg-[var(--lg-separator)] overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${ALERT_BAR_CLASSES[prj.alertLevel]}`}
                            style={{ width: `${Math.min(100, prj.utilizationPct)}%` }}
                          />
                        </div>

                        <div className="flex items-center justify-between text-[11px] tabular-nums">
                          <span className="font-semibold text-[var(--lg-foreground)]">
                            Spent {Money.format(prj.totalSpentMinor)}
                          </span>
                          <span
                            className={
                              prj.remainingMinor < 0
                                ? 'text-rose-600 dark:text-rose-400 font-semibold'
                                : 'text-[var(--lg-muted)]'
                            }
                          >
                            {prj.remainingMinor >= 0
                              ? `${Money.format(prj.remainingMinor)} left`
                              : `${Money.format(Math.abs(prj.remainingMinor))} over`}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[10.5px] text-[var(--lg-muted)] tabular-nums">
                          <span>Budget {Money.format(prj.budgetMinor)}</span>
                          <span>
                            Direct {Money.format(prj.directExpenseMinor)} • Bills{' '}
                            {Money.format(prj.billsIncurredMinor)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
