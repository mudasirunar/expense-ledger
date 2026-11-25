import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  ChevronRight,
  FileText,
  Landmark,
  Smartphone,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { Glass, SegmentedControl } from 'glisse';
import { useAuth } from '@/app/providers/AuthProvider';
import {
  FirestoreAccountRepository,
  FirestoreObligationRepository,
  FirestorePaymentRepository,
  FirestoreProjectRepository,
  FirestoreTransactionRepository,
} from '@/data/repositories/firestore';
import { Account, Obligation, Payment, Project, Transaction } from '@/domain/entities';
import { Money } from '@/domain/accounting/money';
import {
  ActivityFeedItem,
  BudgetAlertLevel,
  CategoryBreakdownItem,
  DashboardScopeFilter,
  DashboardTimeHorizon,
  TrendBucket,
  computeDashboardAnalytics,
} from '@/domain/accounting/dashboardAnalytics';
import { registerMemoryCacheClearer } from '@/data/sync/dataWipeService';
import { ContactsView } from '@/components/contacts/ContactsView';

const accountRepo = new FirestoreAccountRepository();
const transactionRepo = new FirestoreTransactionRepository();
const projectRepo = new FirestoreProjectRepository();
const obligationRepo = new FirestoreObligationRepository();
const paymentRepo = new FirestorePaymentRepository();

interface CachedDashboardState {
  userId: string;
  accounts: Account[];
  transactions: Transaction[];
  projects: Project[];
  obligations: Obligation[];
  payments: Payment[];
}

let cachedDashboard: CachedDashboardState | null = null;
registerMemoryCacheClearer(() => {
  cachedDashboard = null;
});

const LoadingDots: React.FC<{ size?: 'sm' | 'md' }> = ({ size = 'md' }) => {
  const dotSize = size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2';
  const animClass = size === 'sm' ? 'animate-dot-wave-sm' : 'animate-dot-wave-md';
  return (
    <span className="inline-flex items-center gap-1.5 ml-1.5 align-middle">
      <span className={`${dotSize} rounded-full bg-current ${animClass}`} style={{ animationDelay: '0s' }} />
      <span className={`${dotSize} rounded-full bg-current ${animClass}`} style={{ animationDelay: '0.15s' }} />
      <span className={`${dotSize} rounded-full bg-current ${animClass}`} style={{ animationDelay: '0.3s' }} />
    </span>
  );
};

const LIQUIDITY_COLORS: Record<'cash' | 'bank' | 'mobile_wallet' | 'other', string> = {
  cash: '#10B981',
  bank: '#3B82F6',
  mobile_wallet: '#8B5CF6',
  other: '#64748B',
};

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

function formatDateGroupLabel(dateKey: string): string {
  if (!dateKey) return 'Recent';
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const yestDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const yesterday = `${yestDate.getFullYear()}-${String(yestDate.getMonth() + 1).padStart(2, '0')}-${String(yestDate.getDate()).padStart(2, '0')}`;

  if (dateKey === today) return 'Today';
  if (dateKey === yesterday) return 'Yesterday';

  const parsed = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateKey;
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const CashFlowBarChart: React.FC<{
  buckets: TrendBucket[];
  maxMinor: number;
}> = ({ buckets, maxMinor }) => {
  const height = 104;
  const topPad = 10;
  const bottomPad = 22;
  const chartHeight = height - topPad - bottomPad;
  const width = 320;
  const slotWidth = buckets.length > 0 ? width / buckets.length : width;
  const barWidth = Math.min(11, Math.max(6, Math.floor((slotWidth - 10) / 2)));
  const gap = 3;

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-[112px] overflow-visible"
        role="img"
        aria-label="Inflow versus outflow trend chart"
      >
        {/* Subtle horizontal reference lines */}
        <line
          x1="0"
          y1={topPad}
          x2={width}
          y2={topPad}
          stroke="currentColor"
          strokeOpacity="0.08"
          strokeDasharray="3 3"
        />
        <line
          x1="0"
          y1={topPad + chartHeight / 2}
          x2={width}
          y2={topPad + chartHeight / 2}
          stroke="currentColor"
          strokeOpacity="0.08"
          strokeDasharray="3 3"
        />
        <line
          x1="0"
          y1={topPad + chartHeight}
          x2={width}
          y2={topPad + chartHeight}
          stroke="currentColor"
          strokeOpacity="0.14"
        />

        {buckets.map((bucket, idx) => {
          const cx = idx * slotWidth + slotWidth / 2;
          const inHeight =
            maxMinor > 0 && bucket.inflowMinor > 0
              ? Math.max(4, Math.round((bucket.inflowMinor / maxMinor) * chartHeight))
              : 2;
          const outHeight =
            maxMinor > 0 && bucket.outflowMinor > 0
              ? Math.max(4, Math.round((bucket.outflowMinor / maxMinor) * chartHeight))
              : 2;

          return (
            <g key={bucket.key}>
              {/* Inflow bar */}
              <rect
                x={cx - barWidth - gap / 2}
                y={topPad + chartHeight - inHeight}
                width={barWidth}
                height={inHeight}
                rx={barWidth / 2}
                className={bucket.inflowMinor > 0 ? 'fill-emerald-500' : 'fill-emerald-500/20'}
              />
              {/* Outflow bar */}
              <rect
                x={cx + gap / 2}
                y={topPad + chartHeight - outHeight}
                width={barWidth}
                height={outHeight}
                rx={barWidth / 2}
                className={bucket.outflowMinor > 0 ? 'fill-rose-500' : 'fill-rose-500/20'}
              />
              {/* X-axis label */}
              <text
                x={cx}
                y={height - 5}
                textAnchor="middle"
                className="fill-[var(--lg-muted)] text-[9.5px] font-semibold"
              >
                {bucket.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

const CategoryDonutChart: React.FC<{
  items: CategoryBreakdownItem[];
  totalOutflowMinor: number;
}> = ({ items, totalOutflowMinor }) => {
  const size = 108;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  let cumulativeFraction = 0;

  return (
    <div className="relative flex-shrink-0 w-[108px] h-[108px] flex items-center justify-center">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        role="img"
        aria-label="Spending by category donut chart"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.1"
          strokeWidth={strokeWidth}
        />
        {totalOutflowMinor > 0 &&
          items.map((item) => {
            const fraction = item.amountMinor / totalOutflowMinor;
            const dashLength = Math.max(0, fraction * circumference - 2);
            const dashOffset = -cumulativeFraction * circumference;
            cumulativeFraction += fraction;
            return (
              <circle
                key={item.key}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={item.color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray={`${dashLength} ${circumference}`}
                strokeDashoffset={dashOffset}
              />
            );
          })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-2">
        <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--lg-muted)]">
          Spent
        </span>
        <span className="text-[11px] font-extrabold text-[var(--lg-foreground)] tabular-nums leading-tight mt-0.5 truncate max-w-[76px]">
          {Money.format(totalOutflowMinor)}
        </span>
      </div>
    </div>
  );
};

interface DashboardViewProps {
  onRefreshKey: number;
  onNavigateTab?: (tab: 'projects' | 'accounts') => void;
  onOpenHistory?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onRefreshKey,
  onNavigateTab,
  onOpenHistory,
}) => {
  const { user } = useAuth();
  const userId = user?.uid || 'guest-user';

  const hasWarmCache = Boolean(cachedDashboard && cachedDashboard.userId === userId);

  const [timeFilter, setTimeFilter] = useState<DashboardTimeHorizon>('all');
  const [scopeFilter, setScopeFilter] = useState<DashboardScopeFilter>('all');
  const [pinSelectedProject, setPinSelectedProject] = useState<boolean>(true);
  const chipRowRef = useRef<HTMLDivElement>(null);
  const chipButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const [rawAccounts, setRawAccounts] = useState<Account[]>(() =>
    hasWarmCache ? cachedDashboard!.accounts : []
  );
  const [rawTransactions, setRawTransactions] = useState<Transaction[]>(() =>
    hasWarmCache ? cachedDashboard!.transactions : []
  );
  const [rawProjects, setRawProjects] = useState<Project[]>(() =>
    hasWarmCache ? cachedDashboard!.projects : []
  );
  const [rawObligations, setRawObligations] = useState<Obligation[]>(() =>
    hasWarmCache ? cachedDashboard!.obligations : []
  );
  const [rawPayments, setRawPayments] = useState<Payment[]>(() =>
    hasWarmCache ? cachedDashboard!.payments : []
  );
  const [loading, setLoading] = useState<boolean>(() => !hasWarmCache);

  useEffect(() => {
    let accLoaded = false;
    let txLoaded = false;

    const ensureCache = (): CachedDashboardState => {
      if (!cachedDashboard || cachedDashboard.userId !== userId) {
        cachedDashboard = {
          userId,
          accounts: [],
          transactions: [],
          projects: [],
          obligations: [],
          payments: [],
        };
      }
      return cachedDashboard;
    };

    const checkPrimaryLoaded = () => {
      if (accLoaded && txLoaded) {
        setLoading(false);
      }
    };

    const unsubs: Array<() => void> = [];

    if (accountRepo.subscribe) {
      unsubs.push(
        accountRepo.subscribe(
          userId,
          (accs) => {
            setRawAccounts(accs);
            ensureCache().accounts = accs;
            accLoaded = true;
            checkPrimaryLoaded();
          },
          (err) => {
            console.warn('[Dashboard] Account subscribe fallback:', err);
            accLoaded = true;
            checkPrimaryLoaded();
          }
        )
      );
    } else {
      accountRepo.list(userId).then((accs) => {
        setRawAccounts(accs);
        ensureCache().accounts = accs;
        accLoaded = true;
        checkPrimaryLoaded();
      });
    }

    if (transactionRepo.subscribe) {
      unsubs.push(
        transactionRepo.subscribe(
          userId,
          (txs) => {
            setRawTransactions(txs);
            ensureCache().transactions = txs;
            txLoaded = true;
            checkPrimaryLoaded();
          },
          (err) => {
            console.warn('[Dashboard] Transaction subscribe fallback:', err);
            txLoaded = true;
            checkPrimaryLoaded();
          }
        )
      );
    } else {
      transactionRepo.list(userId).then((txs) => {
        setRawTransactions(txs);
        ensureCache().transactions = txs;
        txLoaded = true;
        checkPrimaryLoaded();
      });
    }

    unsubs.push(
      projectRepo.subscribe(
        userId,
        (prjs) => {
          setRawProjects(prjs);
          ensureCache().projects = prjs;
        },
        (err) => console.warn('[Dashboard] Project subscribe fallback:', err)
      )
    );

    unsubs.push(
      obligationRepo.subscribe(
        userId,
        (obls) => {
          setRawObligations(obls);
          ensureCache().obligations = obls;
        },
        (err) => console.warn('[Dashboard] Obligation subscribe fallback:', err)
      )
    );

    unsubs.push(
      paymentRepo.subscribe(
        userId,
        (pays) => {
          setRawPayments(pays);
          ensureCache().payments = pays;
        },
        (err) => console.warn('[Dashboard] Payment subscribe fallback:', err)
      )
    );

    return () => {
      for (const unsub of unsubs) {
        unsub();
      }
    };
  }, [userId, onRefreshKey]);

  // Reset scopeFilter to 'all' if a selected project was deleted/archived
  useEffect(() => {
    if (scopeFilter !== 'all' && scopeFilter !== 'personal') {
      const exists = rawProjects.some((p) => p.id === scopeFilter && p.status !== 'archived');
      if (!exists) setScopeFilter('all');
    }
  }, [rawProjects, scopeFilter]);

  // Smoothly center the selected scope chip horizontally (without affecting vertical scroll)
  useEffect(() => {
    const row = chipRowRef.current;
    const chip = chipButtonRefs.current.get(scopeFilter);
    if (!row || !chip) return;
    const targetLeft = Math.max(0, chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2);
    if (typeof row.scrollTo === 'function') {
      row.scrollTo({ left: targetLeft, behavior: 'smooth' });
    } else {
      row.scrollLeft = targetLeft;
    }
  }, [scopeFilter, rawProjects]);

  const activeProjects = useMemo(
    () => rawProjects.filter((p) => p.status !== 'archived'),
    [rawProjects]
  );

  const analytics = useMemo(
    () =>
      computeDashboardAnalytics({
        accounts: rawAccounts,
        projects: rawProjects,
        transactions: rawTransactions,
        obligations: rawObligations,
        payments: rawPayments,
        timeHorizon: timeFilter,
        scopeFilter,
        pinSelectedProject,
      }),
    [rawAccounts, rawProjects, rawTransactions, rawObligations, rawPayments, timeFilter, scopeFilter, pinSelectedProject]
  );

  // Group recent activity by date label
  const groupedActivity = useMemo(() => {
    const groups: Array<{ dateKey: string; label: string; items: ActivityFeedItem[] }> = [];
    const byKey = new Map<string, ActivityFeedItem[]>();

    for (const item of analytics.recentActivity) {
      const key = item.date || 'recent';
      if (!byKey.has(key)) {
        const list: ActivityFeedItem[] = [];
        byKey.set(key, list);
        groups.push({ dateKey: key, label: formatDateGroupLabel(item.date), items: list });
      }
      byKey.get(key)!.push(item);
    }

    return groups;
  }, [analytics.recentActivity]);

  const liquidityIcon = (type: 'cash' | 'bank' | 'mobile_wallet' | 'other') => {
    switch (type) {
      case 'cash':
        return <Wallet className="w-3.5 h-3.5 text-emerald-500" />;
      case 'bank':
        return <Landmark className="w-3.5 h-3.5 text-blue-500" />;
      case 'mobile_wallet':
        return <Smartphone className="w-3.5 h-3.5 text-violet-500" />;
      default:
        return <Wallet className="w-3.5 h-3.5 text-slate-500" />;
    }
  };

  return (
    <div className="space-y-6 pb-10">
      {/* Time Horizon Segmented Control: All Time (default) | This Month | Today */}
      <div className="flex justify-center w-full">
        <SegmentedControl
          items={[
            { value: 'all', label: 'All Time' },
            { value: 'month', label: 'This Month' },
            { value: 'today', label: 'Today' },
          ]}
          value={timeFilter}
          onValueChange={(val) => {
            if (val) setTimeFilter(val as DashboardTimeHorizon);
          }}
          style={{ '--lg-tab-width': '105px' } as React.CSSProperties}
        />
      </div>

      {/* Scope Context Pills (Combined / Personal / Individual Projects) */}
      <div
        ref={chipRowRef}
        className="relative flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5 -mx-1 px-1"
      >
        {[
          { id: 'all', label: 'All' },
          { id: 'personal', label: 'Personal' },
          ...activeProjects.map((p) => ({ id: p.id, label: p.name })),
        ].map((chip) => {
          const selected = scopeFilter === chip.id;
          return (
            <button
              key={chip.id}
              ref={(el) => {
                if (el) chipButtonRefs.current.set(chip.id, el);
                else chipButtonRefs.current.delete(chip.id);
              }}
              type="button"
              onClick={() => {
                setPinSelectedProject(true);
                setScopeFilter(chip.id);
              }}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                selected
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-600/25'
                  : 'bg-[var(--lg-glass)] text-[var(--lg-muted)] border-[var(--lg-edge)] hover:text-[var(--lg-foreground)]'
              }`}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {/* Primary Hero Glass Card: Overall Net Cash Position on All + All Time; Scoped/Period Net Flow otherwise */}
      {(() => {
        const isOverallAllTime = timeFilter === 'all' && scopeFilter === 'all';
        const selectedProjectName =
          scopeFilter !== 'all' && scopeFilter !== 'personal'
            ? activeProjects.find((p) => p.id === scopeFilter)?.name || 'Project'
            : null;
        const periodLabel =
          timeFilter === 'all' ? 'All Time' : timeFilter === 'month' ? 'This Month' : 'Today';
        const heroTitle = isOverallAllTime
          ? 'Net Cash Position'
          : scopeFilter === 'all'
            ? timeFilter === 'month'
              ? 'This Month Net'
              : "Today's Net"
            : scopeFilter === 'personal'
              ? timeFilter === 'all'
                ? 'Personal Net'
                : `Personal • ${periodLabel}`
              : timeFilter === 'all'
                ? `${selectedProjectName} Net`
                : `${selectedProjectName} • ${periodLabel}`;

        return (
          <Glass className="p-5 rounded-3xl space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold tracking-wider text-[var(--lg-muted)] uppercase truncate">
                  {heroTitle}
                </span>

                {!loading &&
                  (isOverallAllTime ? (
                    (analytics.totalInflowMinor > 0 || analytics.totalOutflowMinor > 0) && (
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold tabular-nums flex-shrink-0 ${
                          analytics.netFlowMinor >= 0
                            ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400'
                            : 'bg-rose-500/12 text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {analytics.netFlowMinor >= 0 ? '+' : ''}
                        {Money.format(analytics.netFlowMinor)}
                        {analytics.savingsRatePct !== null && (
                          <span className="opacity-75">({analytics.savingsRatePct}%)</span>
                        )}
                      </span>
                    )
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold tabular-nums bg-[var(--lg-muted)]/10 text-[var(--lg-muted)] flex-shrink-0">
                      Cash {Money.format(analytics.totalCashMinor)}
                    </span>
                  ))}
              </div>

              <div
                className={`text-[32px] leading-tight font-black tabular-nums tracking-tight ${
                  isOverallAllTime || analytics.netFlowMinor === 0
                    ? 'text-[var(--lg-foreground)]'
                    : analytics.netFlowMinor > 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {loading ? (
                  <span className="inline-flex items-center text-[var(--lg-foreground)]">
                    Rs <LoadingDots size="md" />
                  </span>
                ) : isOverallAllTime ? (
                  Money.format(analytics.totalCashMinor)
                ) : (
                  <>
                    {analytics.netFlowMinor > 0 ? '+' : ''}
                    {Money.format(analytics.netFlowMinor)}
                  </>
                )}
              </div>
            </div>

        {/* Subtle Inflow vs Outflow visual balance bar */}
        {!loading && (analytics.totalInflowMinor > 0 || analytics.totalOutflowMinor > 0) && (() => {
          const total = analytics.totalInflowMinor + analytics.totalOutflowMinor;
          const inflowPct = Math.round((analytics.totalInflowMinor * 100) / total);
          return (
            <div className="w-full h-1.5 rounded-full bg-rose-500/25 overflow-hidden flex">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                style={{ width: `${inflowPct}%` }}
              />
            </div>
          );
        })()}

        {/* Soft Tinted Metric Tiles (No Divider Lines) */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-2xl px-3.5 py-2.5 bg-emerald-500/[0.08] dark:bg-emerald-500/[0.11]">
            <span className="text-[11px] font-semibold text-emerald-700/80 dark:text-emerald-300/80 flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> Inflow
            </span>
            <p className="font-extrabold text-emerald-600 dark:text-emerald-400 text-sm mt-1 tabular-nums truncate">
              {loading ? (
                <span className="inline-flex items-center">
                  Rs <LoadingDots size="sm" />
                </span>
              ) : (
                Money.format(analytics.totalInflowMinor)
              )}
            </p>
          </div>

          <div className="rounded-2xl px-3.5 py-2.5 bg-rose-500/[0.08] dark:bg-rose-500/[0.11]">
            <span className="text-[11px] font-semibold text-rose-700/80 dark:text-rose-300/80 flex items-center gap-1">
              <TrendingDown className="w-3.5 h-3.5 text-rose-500" /> Outflow
            </span>
            <p className="font-extrabold text-rose-600 dark:text-rose-400 text-sm mt-1 tabular-nums truncate">
              {loading ? (
                <span className="inline-flex items-center">
                  Rs <LoadingDots size="sm" />
                </span>
              ) : (
                Money.format(analytics.totalOutflowMinor)
              )}
            </p>
          </div>
        </div>
      </Glass>
        );
      })()}

      {/* Cash Flow Trend Chart (Flat-on-Screen) */}
      <section className="pb-5 border-b border-[var(--lg-separator)] space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xs font-bold tracking-wider text-[var(--lg-muted)] uppercase">
              Cash Flow Trend
            </h2>
            <p className="text-[11px] text-[var(--lg-muted)]">{analytics.trendSubtitle}</p>
          </div>
          <div className="flex items-center gap-3 text-[11px] font-semibold text-[var(--lg-muted)]">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500" /> In
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-500" /> Out
            </span>
          </div>
        </div>

        <CashFlowBarChart
          buckets={analytics.trendBuckets}
          maxMinor={analytics.trendMaxMinor}
        />
      </section>

      {/* Payables & Receivables Standing (Flat-on-Screen) */}
      <section className="pb-5 border-b border-[var(--lg-separator)] space-y-3">
        <h2 className="text-xs font-bold tracking-wider text-[var(--lg-muted)] uppercase">
          Payables &amp; Receivables
        </h2>

        <div className="grid grid-cols-2 divide-x divide-[var(--lg-separator)]">
          <div className="pr-3">
            <span className="text-[11px] font-semibold text-[var(--lg-muted)] flex items-center gap-1">
              <ArrowUpRight className="w-3.5 h-3.5 text-rose-500" /> Payables (You Owe)
            </span>
            <p className="text-base font-extrabold text-[var(--lg-foreground)] tabular-nums mt-1">
              {Money.format(analytics.totalPayableMinor)}
            </p>
            <p className="text-[11px] text-[var(--lg-muted)] mt-0.5">
              {analytics.openPayableCount === 0
                ? 'All bills settled'
                : `${analytics.openPayableCount} open ${analytics.openPayableCount === 1 ? 'bill' : 'bills'}`}
            </p>
          </div>

          <div className="pl-4">
            <span className="text-[11px] font-semibold text-[var(--lg-muted)] flex items-center gap-1">
              <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-500" /> Receivables (Owed)
            </span>
            <p className="text-base font-extrabold text-[var(--lg-foreground)] tabular-nums mt-1">
              {Money.format(analytics.totalReceivableMinor)}
            </p>
            <p className="text-[11px] text-[var(--lg-muted)] mt-0.5">
              {analytics.openReceivableCount === 0
                ? 'No pending invoices'
                : `${analytics.openReceivableCount} open ${analytics.openReceivableCount === 1 ? 'invoice' : 'invoices'}`}
            </p>
          </div>
        </div>

        {analytics.unallocatedAdvancesMinor > 0 && (
          <div className="flex items-center justify-between pt-1 text-xs">
            <span className="text-[var(--lg-muted)] font-medium">Unallocated Advances Paid</span>
            <span className="font-bold text-amber-600 dark:text-amber-400 tabular-nums">
              {Money.format(analytics.unallocatedAdvancesMinor)}
            </span>
          </div>
        )}
      </section>

      {/* Liquidity Mix: Top 5 Accounts by Balance (Flat-on-Screen) */}
      {analytics.topAccounts.length > 0 && (
        <section className="pb-5 border-b border-[var(--lg-separator)] space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold tracking-wider text-[var(--lg-muted)] uppercase">
              Liquidity Mix
            </h2>
            {onNavigateTab && (
              <button
                type="button"
                onClick={() => onNavigateTab('accounts')}
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-0.5"
              >
                {analytics.totalActiveAccountsCount > 5
                  ? `All (${analytics.totalActiveAccountsCount})`
                  : 'Accounts'}{' '}
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Segmented Horizontal Proportion Bar */}
          <div className="w-full h-2 rounded-full bg-[var(--lg-separator)] overflow-hidden flex gap-0.5">
            {analytics.liquidityBreakdown
              .filter((b) => b.sharePct > 0)
              .map((b) => (
                <div
                  key={b.type}
                  style={{
                    width: `${b.sharePct}%`,
                    backgroundColor: LIQUIDITY_COLORS[b.type],
                  }}
                  className="h-full first:rounded-l-full last:rounded-r-full transition-all duration-300"
                />
              ))}
          </div>

          <div className="space-y-1">
            {analytics.topAccounts.map((acc) => (
              <div key={acc.id} className="py-1.5 flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  {liquidityIcon(acc.type)}
                  <span className="font-semibold text-[var(--lg-foreground)] truncate">
                    {acc.name}
                  </span>
                </div>
                <div className="flex items-center gap-2.5 flex-shrink-0 tabular-nums">
                  <span className="text-[11px] text-[var(--lg-muted)]">{acc.sharePct}%</span>
                  <span className="font-bold text-[var(--lg-foreground)]">
                    {Money.format(acc.balanceMinor)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {analytics.totalActiveAccountsCount > 5 && onNavigateTab && (
            <button
              type="button"
              onClick={() => onNavigateTab('accounts')}
              className="text-[11px] font-medium text-[var(--lg-muted)] hover:text-[var(--lg-foreground)] transition-colors"
            >
              +{analytics.totalActiveAccountsCount - 5} more{' '}
              {analytics.totalActiveAccountsCount - 5 === 1 ? 'account' : 'accounts'} in Accounts
            </button>
          )}
        </section>
      )}

      {/* Spending by Category Donut + Breakdown (Flat-on-Screen) */}
      <section className="pb-5 border-b border-[var(--lg-separator)] space-y-3">
        <h2 className="text-xs font-bold tracking-wider text-[var(--lg-muted)] uppercase">
          Spending Breakdown
        </h2>

        {analytics.categoryBreakdown.length === 0 ? (
          <p className="text-xs text-[var(--lg-muted)] py-2">
            No expenses or obligations recorded in this period.
          </p>
        ) : (
          <div className="flex items-center gap-4">
            <CategoryDonutChart
              items={analytics.categoryBreakdown}
              totalOutflowMinor={analytics.totalOutflowMinor}
            />

            <div className="flex-1 min-w-0 space-y-1">
              {analytics.categoryBreakdown.map((cat) => (
                <div key={cat.key} className="py-1.5 flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: cat.color }}
                    />
                    <span className="font-semibold text-[var(--lg-foreground)] truncate">
                      {cat.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 tabular-nums">
                    <span className="text-[11px] text-[var(--lg-muted)]">{cat.sharePct}%</span>
                    <span className="font-bold text-[var(--lg-foreground)]">
                      {Money.format(cat.amountMinor)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Active Projects Budget Health: Top 5 Projects (Flat-on-Screen) */}
      {analytics.projectHealth.length > 0 && (
        <section className="pt-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold tracking-wider text-[var(--lg-muted)] uppercase">
              Project Budget Health
            </h2>
            {onNavigateTab && (
              <button
                type="button"
                onClick={() => onNavigateTab('projects')}
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-0.5"
              >
                {analytics.totalActiveProjectsCount > 5
                  ? `All (${analytics.totalActiveProjectsCount})`
                  : 'Projects'}{' '}
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="space-y-3">
            {analytics.projectHealth.map((prj) => {
              const hasActiveProjectFilter = scopeFilter !== 'all' && scopeFilter !== 'personal';
              const isSelected = scopeFilter === prj.id;
              return (
                <div
                  key={prj.id}
                  onClick={() => {
                    setPinSelectedProject(false);
                    setScopeFilter(isSelected ? 'all' : prj.id);
                  }}
                  className={`space-y-1.5 cursor-pointer transition-all ${
                    isSelected
                      ? 'pl-3 border-l-[3px] border-blue-500'
                      : hasActiveProjectFilter
                        ? 'opacity-50 hover:opacity-80'
                        : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span
                      className={`font-bold truncate ${
                        isSelected
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-[var(--lg-foreground)]'
                      }`}
                    >
                      {prj.name}
                    </span>
                    <span className={`font-bold tabular-nums flex-shrink-0 ${ALERT_TEXT_CLASSES[prj.alertLevel]}`}>
                      {prj.utilizationPct}%
                    </span>
                  </div>

                  <div className="w-full h-1.5 rounded-full bg-[var(--lg-separator)] overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${ALERT_BAR_CLASSES[prj.alertLevel]}`}
                      style={{ width: `${Math.min(100, prj.utilizationPct)}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-[var(--lg-muted)] tabular-nums">
                    <span>Spent {Money.format(prj.spentMinor)}</span>
                    <span>
                      {prj.remainingMinor >= 0
                        ? `${Money.format(prj.remainingMinor)} left`
                        : `${Money.format(Math.abs(prj.remainingMinor))} over`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {analytics.totalActiveProjectsCount > 5 && onNavigateTab && (
            <button
              type="button"
              onClick={() => onNavigateTab('projects')}
              className="text-[11px] font-medium text-[var(--lg-muted)] hover:text-[var(--lg-foreground)] transition-colors"
            >
              +{analytics.totalActiveProjectsCount - 5} more{' '}
              {analytics.totalActiveProjectsCount - 5 === 1 ? 'project' : 'projects'} in Projects
            </button>
          )}
        </section>
      )}

      {/* Recent Activity Feed (Last 5 items, Grouped by Date, Flat-on-Screen) */}
      <section className="pb-5 border-b border-[var(--lg-separator)] space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold tracking-wider text-[var(--lg-muted)] uppercase">
            Recent Activity
          </h2>
          <button
            type="button"
            onClick={() => onOpenHistory?.()}
            className="text-xs font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-0.5"
          >
            History <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {groupedActivity.length === 0 ? (
          <p className="text-xs text-[var(--lg-muted)] py-2">
            No activity recorded for this filter yet. Tap + to add an entry.
          </p>
        ) : (
          <div className="space-y-4">
            {groupedActivity.map((group) => (
              <div key={group.dateKey} className="space-y-1">
                <p className="text-[11px] font-bold text-[var(--lg-muted)] uppercase tracking-wide">
                  {group.label}
                </p>
                <div className="space-y-1">
                  {group.items.map((item) => (
                    <div
                      key={item.id}
                      className="py-2.5 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                            item.direction === 'neutral'
                              ? 'bg-blue-500/12 text-blue-600 dark:text-blue-400'
                              : item.direction === 'in'
                                ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400'
                                : 'bg-rose-500/12 text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {item.direction === 'neutral' ? (
                            <ArrowLeftRight className="w-3.5 h-3.5" />
                          ) : item.kind === 'obligation' ? (
                            <FileText className="w-3.5 h-3.5" />
                          ) : item.direction === 'in' ? (
                            <ArrowDownLeft className="w-3.5 h-3.5" />
                          ) : (
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          )}
                        </div>

                        <div className="min-w-0">
                          <p className="text-xs font-bold text-[var(--lg-foreground)] truncate">
                            {item.title}
                          </p>
                          <p className="text-[11px] text-[var(--lg-muted)] truncate">
                            {item.subtitle}
                          </p>
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0">
                        <p
                          className={`text-xs font-extrabold tabular-nums ${
                            item.direction === 'neutral'
                              ? 'text-[var(--lg-foreground)]'
                              : item.direction === 'in'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {item.direction === 'in' ? '+' : item.direction === 'out' ? '-' : ''}
                          {Money.format(item.amountMinor)}
                        </p>
                        <p className="text-[10px] font-semibold text-[var(--lg-muted)] uppercase">
                          {item.badge}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Contacts Directory Reference (Kept accessible on Overview) */}
      <section className="pt-2">
        <ContactsView />
      </section>
    </div>
  );
};
