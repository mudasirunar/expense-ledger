import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  ChevronLeft,
  Clock,
  Download,
  FileText,
  Loader2,
} from 'lucide-react';
import { Button } from 'glisse';
import { useAuth } from '@/app/providers/AuthProvider';
import { useSnackbar } from '@/app/providers/SnackbarProvider';
import { exportLedgerExcel } from '@/data/sync/backupRestoreService';
import {
  FirestoreAccountRepository,
  FirestoreContactRepository,
  FirestoreObligationRepository,
  FirestorePaymentRepository,
  FirestoreProjectRepository,
  FirestoreTransactionRepository,
} from '@/data/repositories/firestore';
import { Account, Contact, Obligation, Payment, Project, Transaction } from '@/domain/entities';
import { Money } from '@/domain/accounting/money';
import { ActivityFeedItem, buildActivityFeed } from '@/domain/accounting/dashboardAnalytics';
import { registerMemoryCacheClearer } from '@/data/sync/dataWipeService';
import { ActivityDetailSheet } from './ActivityDetailSheet';

const accountRepo = new FirestoreAccountRepository();
const contactRepo = new FirestoreContactRepository();
const transactionRepo = new FirestoreTransactionRepository();
const projectRepo = new FirestoreProjectRepository();
const obligationRepo = new FirestoreObligationRepository();
const paymentRepo = new FirestorePaymentRepository();

interface CachedHistoryState {
  userId: string;
  accounts: Account[];
  contacts: Contact[];
  transactions: Transaction[];
  projects: Project[];
  obligations: Obligation[];
  payments: Payment[];
}

let cachedHistory: CachedHistoryState | null = null;
registerMemoryCacheClearer(() => {
  cachedHistory = null;
});

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
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

interface HistoryViewProps {
  onBack: () => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({ onBack }) => {
  const { user } = useAuth();
  const { showSnackbar } = useSnackbar();
  const userId = user?.uid || 'guest-user';

  const hasWarmCache = Boolean(cachedHistory && cachedHistory.userId === userId);
  const [isExportingCsv, setIsExportingCsv] = useState(false);

  const [accounts, setAccounts] = useState<Account[]>(() =>
    hasWarmCache ? cachedHistory!.accounts : []
  );
  const [contacts, setContacts] = useState<Contact[]>(() =>
    hasWarmCache ? cachedHistory!.contacts : []
  );
  const [transactions, setTransactions] = useState<Transaction[]>(() =>
    hasWarmCache ? cachedHistory!.transactions : []
  );
  const [projects, setProjects] = useState<Project[]>(() =>
    hasWarmCache ? cachedHistory!.projects : []
  );
  const [obligations, setObligations] = useState<Obligation[]>(() =>
    hasWarmCache ? cachedHistory!.obligations : []
  );
  const [payments, setPayments] = useState<Payment[]>(() =>
    hasWarmCache ? cachedHistory!.payments : []
  );
  const [loading, setLoading] = useState<boolean>(() => !hasWarmCache);
  const [selectedItem, setSelectedItem] = useState<ActivityFeedItem | null>(null);

  const handleExportExcel = async () => {
    if (!user?.uid || isExportingCsv) return;
    setIsExportingCsv(true);
    try {
      const { rowCount, outcome } = await exportLedgerExcel(user.uid);
      if (outcome === 'shared' || outcome === 'downloaded') {
        showSnackbar({
          message:
            rowCount > 0
              ? `Exported ${rowCount} ${rowCount === 1 ? 'entry' : 'entries'} to Excel.`
              : 'No entries to export yet.',
          tone: rowCount > 0 ? 'success' : 'default',
        });
      }
    } catch (error) {
      console.error('[History] Excel export failed:', error);
      showSnackbar({
        message: 'Could not export Excel file. Please try again.',
        tone: 'error',
      });
    } finally {
      setIsExportingCsv(false);
    }
  };

  useEffect(() => {
    const ensureCache = (): CachedHistoryState => {
      if (!cachedHistory || cachedHistory.userId !== userId) {
        cachedHistory = {
          userId,
          accounts: [],
          contacts: [],
          transactions: [],
          projects: [],
          obligations: [],
          payments: [],
        };
      }
      return cachedHistory;
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
          (err) => console.warn('[History] Account subscribe:', err)
        )
      );
    }

    if (contactRepo.subscribe) {
      unsubs.push(
        contactRepo.subscribe(
          userId,
          (cnts) => {
            setContacts(cnts);
            ensureCache().contacts = cnts;
          },
          (err) => console.warn('[History] Contact subscribe:', err)
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
            console.warn('[History] Transaction subscribe:', err);
            setLoading(false);
          }
        )
      );
    } else {
      transactionRepo.list(userId).then((txs) => {
        setTransactions(txs);
        ensureCache().transactions = txs;
        setLoading(false);
      });
    }

    unsubs.push(
      projectRepo.subscribe(
        userId,
        (prjs) => {
          setProjects(prjs);
          ensureCache().projects = prjs;
        },
        (err) => console.warn('[History] Project subscribe:', err)
      )
    );

    unsubs.push(
      obligationRepo.subscribe(
        userId,
        (obls) => {
          setObligations(obls);
          ensureCache().obligations = obls;
        },
        (err) => console.warn('[History] Obligation subscribe:', err)
      )
    );

    unsubs.push(
      paymentRepo.subscribe(
        userId,
        (pays) => {
          setPayments(pays);
          ensureCache().payments = pays;
        },
        (err) => console.warn('[History] Payment subscribe:', err)
      )
    );

    return () => {
      for (const unsub of unsubs) {
        unsub();
      }
    };
  }, [userId]);

  const feed = useMemo(
    () =>
      buildActivityFeed({
        accounts,
        projects,
        transactions,
        obligations,
        payments,
        timeHorizon: 'all',
        scopeFilter: 'all',
      }),
    [accounts, projects, transactions, obligations, payments]
  );

  const groupedFeed = useMemo(() => {
    const groups: Array<{ dateKey: string; label: string; items: ActivityFeedItem[] }> = [];
    const byKey = new Map<string, ActivityFeedItem[]>();

    for (const item of feed) {
      const key = item.date || 'recent';
      if (!byKey.has(key)) {
        const list: ActivityFeedItem[] = [];
        byKey.set(key, list);
        groups.push({ dateKey: key, label: formatDateGroupLabel(item.date), items: list });
      }
      byKey.get(key)!.push(item);
    }

    return groups;
  }, [feed]);

  return (
    <div className="flex flex-col app-screen w-full bg-[#E2DDD5] dark:bg-background text-slate-900 dark:text-slate-100 overflow-hidden font-sans transition-colors duration-200">
      {/* Fully scrollable standalone screen: status-bar spacer + top bar scroll up together */}
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
            <h1 className="text-xl font-extrabold text-[var(--lg-foreground)] tracking-tight truncate">
              History
            </h1>
          </div>

          <Button
            variant="glass"
            aria-label="Export Excel"
            onClick={handleExportExcel}
            disabled={isExportingCsv}
            icon={
              isExportingCsv ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Download className="w-5 h-5" />
              )
            }
            className="!p-0 !rounded-full !w-[44px] !h-[44px] flex-shrink-0"
          />
        </header>

        {/* Flat-on-screen list of all transactions (no cards, no horizontal divider lines) */}
        <main className="max-w-md mx-auto w-full px-4 pt-3 pb-12">
          {loading ? (
            <div className="space-y-4 animate-pulse pt-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center justify-between gap-3 py-2">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-[var(--lg-muted)]/15" />
                    <div className="space-y-1.5">
                      <div className="h-3.5 w-32 rounded bg-[var(--lg-muted)]/15" />
                      <div className="h-3 w-24 rounded bg-[var(--lg-muted)]/10" />
                    </div>
                  </div>
                  <div className="h-3.5 w-16 rounded bg-[var(--lg-muted)]/15" />
                </div>
              ))}
            </div>
          ) : groupedFeed.length === 0 ? (
            <div className="min-h-[62vh] flex flex-col items-center justify-center px-4 text-center space-y-3">
              <Clock className="w-11 h-11 text-[var(--lg-muted)] opacity-50" />
              <div>
                <p className="text-sm font-bold text-[var(--lg-foreground)]">No transactions yet</p>
                <p className="text-xs text-[var(--lg-muted)] max-w-xs mx-auto mt-1 leading-relaxed">
                  All recorded expenses, income, transfers, bills, and settlements will appear here.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {groupedFeed.map((group) => (
                <section key={group.dateKey} className="space-y-1.5">
                  <p className="text-[11px] font-bold text-[var(--lg-muted)] uppercase tracking-wider">
                    {group.label}
                  </p>
                  <div className="space-y-1">
                    {group.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelectedItem(item)}
                        className="w-full text-left py-2.5 px-1 -mx-1 rounded-2xl flex items-center justify-between gap-3 active:bg-[var(--lg-glass)] transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                              item.direction === 'neutral'
                                ? 'bg-blue-500/12 text-blue-600 dark:text-blue-400'
                                : item.direction === 'in'
                                  ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400'
                                  : 'bg-rose-500/12 text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {item.direction === 'neutral' ? (
                              <ArrowLeftRight className="w-4 h-4" />
                            ) : item.kind === 'obligation' ? (
                              <FileText className="w-4 h-4" />
                            ) : item.direction === 'in' ? (
                              <ArrowDownLeft className="w-4 h-4" />
                            ) : (
                              <ArrowUpRight className="w-4 h-4" />
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
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Reusable Transaction Detail Bottom Sheet */}
      <ActivityDetailSheet
        selectedItem={selectedItem}
        onClose={() => setSelectedItem(null)}
        accounts={accounts}
        projects={projects}
        contacts={contacts}
        transactions={transactions}
        obligations={obligations}
        payments={payments}
      />
    </div>
  );
};
