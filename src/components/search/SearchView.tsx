import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Building2,
  FileText,
  Landmark,
  Search,
  Smartphone,
  User,
  Wallet,
  X,
} from 'lucide-react';
import { Button } from 'glisse';
import { useAuth } from '@/app/providers/AuthProvider';
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
import { ActivityFeedItem } from '@/domain/accounting/dashboardAnalytics';
import {
  SearchFilterCategory,
  searchLedgerEntities,
} from '@/domain/accounting/searchEngine';
import { registerMemoryCacheClearer } from '@/data/sync/dataWipeService';
import { ActivityDetailSheet } from '@/components/history/ActivityDetailSheet';
import { ProjectDetailModal } from '@/components/projects/ProjectDetailModal';
import { ContactDetailModal } from '@/components/contacts/ContactDetailModal';
import { AccountDetailModal } from '@/components/accounts/AccountDetailModal';

const accountRepo = new FirestoreAccountRepository();
const contactRepo = new FirestoreContactRepository();
const transactionRepo = new FirestoreTransactionRepository();
const projectRepo = new FirestoreProjectRepository();
const obligationRepo = new FirestoreObligationRepository();
const paymentRepo = new FirestorePaymentRepository();

const RECENT_SEARCHES_KEY_PREFIX = 'expense_ledger_recent_searches_';
const MAX_RECENT_SEARCHES = 25;
const INITIAL_RECENT_VISIBLE = 7;

interface CachedSearchData {
  userId: string;
  accounts: Account[];
  contacts: Contact[];
  transactions: Transaction[];
  projects: Project[];
  obligations: Obligation[];
  payments: Payment[];
}

let cachedSearchData: CachedSearchData | null = null;
registerMemoryCacheClearer(() => {
  cachedSearchData = null;
});

function loadRecentSearches(userId: string): string[] {
  try {
    const raw = localStorage.getItem(`${RECENT_SEARCHES_KEY_PREFIX}${userId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).slice(0, MAX_RECENT_SEARCHES)
      : [];
  } catch {
    return [];
  }
}

function saveRecentSearches(userId: string, items: string[]): void {
  try {
    localStorage.setItem(`${RECENT_SEARCHES_KEY_PREFIX}${userId}`, JSON.stringify(items));
  } catch {
    // ignore storage errors
  }
}

interface SearchViewProps {
  onBack: () => void;
}

export const SearchView: React.FC<SearchViewProps> = ({ onBack }) => {
  const { user } = useAuth();
  const userId = user?.uid || 'guest-user';

  const hasWarmCache = Boolean(cachedSearchData && cachedSearchData.userId === userId);
  const [query, setQuery] = useState<string>('');
  const [filter, setFilter] = useState<SearchFilterCategory>('all');
  const [recentSearches, setRecentSearches] = useState<string[]>(() => loadRecentSearches(userId));
  const [showAllRecent, setShowAllRecent] = useState<boolean>(false);
  const [selectedActivity, setSelectedActivity] = useState<ActivityFeedItem | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  const [accounts, setAccounts] = useState<Account[]>(() =>
    hasWarmCache ? cachedSearchData!.accounts : []
  );
  const [contacts, setContacts] = useState<Contact[]>(() =>
    hasWarmCache ? cachedSearchData!.contacts : []
  );
  const [transactions, setTransactions] = useState<Transaction[]>(() =>
    hasWarmCache ? cachedSearchData!.transactions : []
  );
  const [projects, setProjects] = useState<Project[]>(() =>
    hasWarmCache ? cachedSearchData!.projects : []
  );
  const [obligations, setObligations] = useState<Obligation[]>(() =>
    hasWarmCache ? cachedSearchData!.obligations : []
  );
  const [payments, setPayments] = useState<Payment[]>(() =>
    hasWarmCache ? cachedSearchData!.payments : []
  );

  const inputRef = useRef<HTMLInputElement>(null);

  // Sync recent searches when user changes
  useEffect(() => {
    setRecentSearches(loadRecentSearches(userId));
  }, [userId]);

  // Auto-focus search bar on mount without causing iOS PWA viewport scroll/bottom gap
  useEffect(() => {
    const focusInput = () => {
      const el = inputRef.current;
      if (!el) return;
      try {
        el.focus({ preventScroll: true });
      } catch {
        el.focus();
      }
      window.scrollTo(0, 0);
    };

    // Focus synchronously + RAF fallback for smooth mobile keyboard open
    focusInput();
    const raf = requestAnimationFrame(focusInput);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Subscribe live to all 6 Firestore collections (served instantly from local IndexedDB offline)
  useEffect(() => {
    const ensureCache = (): CachedSearchData => {
      if (!cachedSearchData || cachedSearchData.userId !== userId) {
        cachedSearchData = {
          userId,
          accounts: [],
          contacts: [],
          transactions: [],
          projects: [],
          obligations: [],
          payments: [],
        };
      }
      return cachedSearchData;
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
          (err) => console.warn('[Search] Account subscribe:', err)
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
          (err) => console.warn('[Search] Contact subscribe:', err)
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
          },
          (err) => console.warn('[Search] Transaction subscribe:', err)
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
        (err) => console.warn('[Search] Project subscribe:', err)
      )
    );

    unsubs.push(
      obligationRepo.subscribe(
        userId,
        (obls) => {
          setObligations(obls);
          ensureCache().obligations = obls;
        },
        (err) => console.warn('[Search] Obligation subscribe:', err)
      )
    );

    unsubs.push(
      paymentRepo.subscribe(
        userId,
        (pays) => {
          setPayments(pays);
          ensureCache().payments = pays;
        },
        (err) => console.warn('[Search] Payment subscribe:', err)
      )
    );

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [userId]);

  const recordRecentSearch = (term: string) => {
    const clean = term.trim();
    if (!clean) return;
    setRecentSearches((prev) => {
      const next = [
        clean,
        ...prev.filter((item) => item.toLowerCase() !== clean.toLowerCase()),
      ].slice(0, MAX_RECENT_SEARCHES);
      saveRecentSearches(userId, next);
      return next;
    });
  };

  const handleClearAllRecent = () => {
    setRecentSearches([]);
    setShowAllRecent(false);
    saveRecentSearches(userId, []);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = query.trim();
    if (!clean) return;
    recordRecentSearch(clean);
    inputRef.current?.blur();
    window.scrollTo(0, 0);
  };

  // Main outside circular X button always closes the Search screen back to previous tab
  const handleCloseClick = () => {
    inputRef.current?.blur();
    window.scrollTo(0, 0);
    onBack();
  };

  const handleClearText = () => {
    setQuery('');
    const el = inputRef.current;
    if (el) {
      try {
        el.focus({ preventScroll: true });
      } catch {
        el.focus();
      }
      window.scrollTo(0, 0);
    }
  };

  const results = useMemo(
    () =>
      searchLedgerEntities({
        query,
        accounts,
        projects,
        contacts,
        transactions,
        obligations,
        payments,
      }),
    [query, accounts, projects, contacts, transactions, obligations, payments]
  );

  const hasQuery = query.trim().length > 0;

  const showActivity = (filter === 'all' || filter === 'activity') && results.activity.length > 0;
  const showProjects = (filter === 'all' || filter === 'projects') && results.projects.length > 0;
  const showAccounts = (filter === 'all' || filter === 'accounts') && results.accounts.length > 0;
  const showContacts = (filter === 'all' || filter === 'contacts') && results.contacts.length > 0;

  const visibleCount =
    (showActivity ? results.activity.length : 0) +
    (showProjects ? results.projects.length : 0) +
    (showAccounts ? results.accounts.length : 0) +
    (showContacts ? results.contacts.length : 0);

  const accountIcon = (type: Account['type']) => {
    switch (type) {
      case 'cash':
        return <Wallet className="w-4 h-4 text-emerald-500" />;
      case 'bank':
        return <Landmark className="w-4 h-4 text-blue-500" />;
      case 'mobile_wallet':
        return <Smartphone className="w-4 h-4 text-violet-500" />;
      default:
        return <Wallet className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="flex flex-col app-screen w-full bg-[#E2DDD5] dark:bg-background text-slate-900 dark:text-slate-100 overflow-hidden font-sans transition-colors duration-200">
      {/* Standalone Search Screen — NO pull-to-refresh, static 100lvh on iOS PWA to prevent bottom keyboard gap */}
      <div className="flex-1 overflow-y-auto scroll-container overscroll-y-contain">
        <div
          className="w-full select-none pointer-events-none"
          style={{ height: 'var(--top-spacer, env(safe-area-inset-top, 0px))' }}
        />

        {/* Expanding Search Header: Long Glisse pill search bar + separate circular Glisse X button outside */}
        <header className="max-w-md mx-auto w-full px-4 py-2.5 flex items-center gap-2.5 select-none">
          <form
            action=""
            onSubmit={handleSubmit}
            className="flex-1 min-w-0 animate-search-expand"
          >
            <div className="h-[44px] w-full rounded-full bg-[var(--lg-glass)] border border-[var(--lg-edge)] backdrop-blur-xl shadow-sm flex items-center gap-2.5 px-3.5 focus-within:bg-[var(--lg-glass-active)] transition-colors">
              <Search className="w-4 h-4 text-[var(--lg-muted)] flex-shrink-0" />
              <input
                ref={inputRef}
                type="search"
                enterKeyHint="search"
                required
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="Search entries, projects, contacts…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search ledger"
                className="w-full min-w-0 bg-transparent text-sm text-[var(--lg-foreground)] placeholder:text-[var(--lg-muted)] focus:outline-none"
              />
              {query.length > 0 && (
                <button
                  type="button"
                  aria-label="Clear search text"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleClearText}
                  className="w-4 h-4 rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:opacity-85 flex items-center justify-center flex-shrink-0 transition-opacity"
                >
                  <X className="w-2.5 h-2.5 stroke-[2.75]" />
                </button>
              )}
            </div>
          </form>

          <Button
            variant="glass"
            type="button"
            aria-label="Close search"
            onClick={handleCloseClick}
            icon={<X className="w-4 h-4" />}
            className="!p-0 !rounded-full !w-[44px] !h-[44px] flex-shrink-0"
          />
        </header>

        <main className="max-w-md mx-auto w-full px-4 pt-2 pb-12 space-y-5">
          {!hasQuery ? (
            /* ================= RECENT SEARCHES ================= */
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold tracking-wider text-[var(--lg-muted)] uppercase">
                  Recent Searches
                </h2>
                {recentSearches.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAllRecent}
                    className="text-xs font-semibold text-blue-600 dark:text-blue-400"
                  >
                    Clear All
                  </button>
                )}
              </div>

              {recentSearches.length === 0 ? (
                <div className="py-12 text-center space-y-1.5">
                  <Search className="w-7 h-7 mx-auto text-[var(--lg-muted)] opacity-50" />
                  <p className="text-xs font-medium text-[var(--lg-muted)]">
                    Search across transactions, bills, payments, projects, accounts, and contacts.
                  </p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {(showAllRecent
                    ? recentSearches
                    : recentSearches.slice(0, INITIAL_RECENT_VISIBLE)
                  ).map((term) => (
                    <button
                      key={term}
                      type="button"
                      onClick={() => {
                        setQuery(term);
                        recordRecentSearch(term);
                        inputRef.current?.blur();
                      }}
                      className="w-full text-left py-1.5 px-1 -mx-1 rounded-xl flex items-center active:bg-[var(--lg-glass)] transition-colors"
                    >
                      <span className="text-sm font-medium text-[var(--lg-foreground)] truncate">
                        {term}
                      </span>
                    </button>
                  ))}

                  {recentSearches.length > INITIAL_RECENT_VISIBLE && (
                    <div className="pt-2 flex justify-center">
                      <button
                        type="button"
                        onClick={() => setShowAllRecent((prev) => !prev)}
                        className="text-xs font-semibold text-blue-600 dark:text-blue-400 px-3 py-1 rounded-full active:bg-[var(--lg-glass)] transition-colors"
                      >
                        {showAllRecent ? 'Show Less' : 'Show All'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </section>
          ) : (
            /* ================= LIVE SEARCH RESULTS ================= */
            <>
              {/* Filter Chips */}
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
                {(
                  [
                    { id: 'all', label: `All (${results.totalCount})` },
                    { id: 'activity', label: `Activity (${results.activity.length})` },
                    { id: 'projects', label: `Projects (${results.projects.length})` },
                    { id: 'accounts', label: `Accounts (${results.accounts.length})` },
                    { id: 'contacts', label: `Contacts (${results.contacts.length})` },
                  ] as Array<{ id: SearchFilterCategory; label: string }>
                ).map((chip) => {
                  const active = filter === chip.id;
                  return (
                    <button
                      key={chip.id}
                      type="button"
                      onClick={() => setFilter(chip.id)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0 ${
                        active
                          ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/25'
                          : 'bg-[var(--lg-glass)] text-[var(--lg-muted)] border border-[var(--lg-edge)] hover:text-[var(--lg-foreground)]'
                      }`}
                    >
                      {chip.label}
                    </button>
                  );
                })}
              </div>

              {visibleCount === 0 ? (
                <div className="py-12 text-center space-y-1.5">
                  <Search className="w-7 h-7 mx-auto text-[var(--lg-muted)] opacity-50" />
                  <p className="text-sm font-bold text-[var(--lg-foreground)]">No matches found</p>
                  <p className="text-xs text-[var(--lg-muted)]">
                    Try another keyword, project name, contact, or amount.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Activity Results */}
                  {showActivity && (
                    <section className="space-y-2">
                      <h2 className="text-xs font-bold tracking-wider text-[var(--lg-muted)] uppercase">
                        Activity ({results.activity.length})
                      </h2>
                      <div className="space-y-1">
                        {results.activity.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              recordRecentSearch(query);
                              inputRef.current?.blur();
                              setSelectedActivity(item);
                            }}
                            className="w-full text-left py-2.5 px-1 -mx-1 rounded-2xl flex items-center justify-between gap-3 active:bg-[var(--lg-glass)] transition-colors"
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
                                  {item.subtitle} • {item.date}
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
                  )}

                  {/* Projects Results */}
                  {showProjects && (
                    <section className="space-y-2">
                      <h2 className="text-xs font-bold tracking-wider text-[var(--lg-muted)] uppercase">
                        Projects ({results.projects.length})
                      </h2>
                      <div className="space-y-1">
                        {results.projects.map((prj) => (
                          <button
                            key={prj.id}
                            type="button"
                            onClick={() => {
                              recordRecentSearch(query);
                              inputRef.current?.blur();
                              setSelectedProject(prj);
                            }}
                            className="w-full text-left py-2.5 px-1 -mx-1 rounded-2xl flex items-center justify-between gap-3 active:bg-[var(--lg-glass)] transition-colors"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-8 h-8 rounded-full bg-blue-500/12 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0">
                                <Building2 className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-[var(--lg-foreground)] truncate">
                                  {prj.name}
                                </p>
                                <p className="text-[11px] text-[var(--lg-muted)] truncate capitalize">
                                  {prj.status.replace('_', ' ')}
                                  {prj.location ? ` • ${prj.location}` : ''}
                                </p>
                              </div>
                            </div>
                            <span className="text-xs font-bold tabular-nums text-[var(--lg-foreground)] flex-shrink-0">
                              {Money.format(prj.budgetMinor)}
                            </span>
                          </button>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Accounts Results */}
                  {showAccounts && (
                    <section className="space-y-2">
                      <h2 className="text-xs font-bold tracking-wider text-[var(--lg-muted)] uppercase">
                        Accounts ({results.accounts.length})
                      </h2>
                      <div className="space-y-1">
                        {results.accounts.map((acc) => (
                          <button
                            key={acc.id}
                            type="button"
                            onClick={() => {
                              recordRecentSearch(query);
                              inputRef.current?.blur();
                              setSelectedAccount(acc);
                            }}
                            className="w-full text-left py-2.5 px-1 -mx-1 rounded-2xl flex items-center justify-between gap-3 active:bg-[var(--lg-glass)] transition-colors"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-8 h-8 rounded-full bg-[var(--lg-glass)] border border-[var(--lg-edge)] flex items-center justify-center flex-shrink-0">
                                {accountIcon(acc.type)}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-[var(--lg-foreground)] truncate">
                                  {acc.name}
                                </p>
                                <p className="text-[11px] text-[var(--lg-muted)] truncate capitalize">
                                  {acc.type.replace('_', ' ')}
                                  {acc.institution ? ` • ${acc.institution}` : ''}
                                </p>
                              </div>
                            </div>
                            <span className="text-xs font-extrabold tabular-nums text-[var(--lg-foreground)] flex-shrink-0">
                              {Money.format(acc.currentBalanceMinor)}
                            </span>
                          </button>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Contacts Results */}
                  {showContacts && (
                    <section className="space-y-2">
                      <h2 className="text-xs font-bold tracking-wider text-[var(--lg-muted)] uppercase">
                        Contacts ({results.contacts.length})
                      </h2>
                      <div className="space-y-1">
                        {results.contacts.map((cnt) => (
                          <button
                            key={cnt.id}
                            type="button"
                            onClick={() => {
                              recordRecentSearch(query);
                              inputRef.current?.blur();
                              setSelectedContact(cnt);
                            }}
                            className="w-full text-left py-2.5 px-1 -mx-1 rounded-2xl flex items-center justify-between gap-3 active:bg-[var(--lg-glass)] transition-colors"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-8 h-8 rounded-full bg-indigo-500/12 text-indigo-600 dark:text-indigo-400 flex items-center justify-center flex-shrink-0">
                                <User className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-[var(--lg-foreground)] truncate">
                                  {cnt.name}
                                </p>
                                <p className="text-[11px] text-[var(--lg-muted)] truncate capitalize">
                                  {cnt.roles.join(', ')}
                                  {cnt.phone ? ` • ${cnt.phone}` : ''}
                                </p>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Reusable Transaction Detail & Share Bottom Sheet */}
      <ActivityDetailSheet
        selectedItem={selectedActivity}
        onClose={() => setSelectedActivity(null)}
        accounts={accounts}
        projects={projects}
        contacts={contacts}
        transactions={transactions}
        obligations={obligations}
        payments={payments}
      />

      {/* Reusable Project Detail Modal */}
      <ProjectDetailModal
        project={selectedProject}
        onClose={() => setSelectedProject(null)}
      />

      {/* Reusable Account Detail Modal */}
      <AccountDetailModal
        account={selectedAccount}
        onClose={() => setSelectedAccount(null)}
      />

      {/* Reusable Contact Detail Modal */}
      <ContactDetailModal
        contact={selectedContact}
        userId={userId}
        payments={payments}
        onClose={() => setSelectedContact(null)}
      />
    </div>
  );
};
