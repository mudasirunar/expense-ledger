import React, { useState, useEffect, useMemo } from 'react';
import { SyncProvider } from './app/providers/SyncProvider';
import { ThemeProvider } from './app/providers/ThemeProvider';
import { AuthProvider, useAuth } from './app/providers/AuthProvider';
import { SnackbarProvider } from './app/providers/SnackbarProvider';
import { MobileAppLayout } from './app/layouts/MobileAppLayout';
import { NavTab } from '@/components/layout/BottomNavigation';
import { ProjectsView } from '@/components/projects/ProjectsView';
import { ContactsView } from '@/components/contacts/ContactsView';
import { AccountsView } from '@/components/accounts/AccountsView';
import { QuickAddModal } from '@/components/entry/QuickAddModal';
import { ProfileView } from '@/components/profile/ProfileView';
import { FirestoreAccountRepository, FirestoreTransactionRepository } from '@/data/repositories/firestore';
import { Account, Transaction } from '@/domain/entities';
import { Money } from '@/domain/accounting/money';
import { ShieldCheck, TrendingUp, TrendingDown } from 'lucide-react';
import { Glass, SegmentedControl } from 'glisse';
import { registerMemoryCacheClearer } from '@/data/sync/dataWipeService';

const accountRepo = new FirestoreAccountRepository();
const transactionRepo = new FirestoreTransactionRepository();

// Animated bouncing dots with visible vertical wave movement
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

// In-memory cache for instant (< 1ms) dashboard tab switching & zero-spinner remounts
let cachedDashboard: {
  userId: string;
  accounts: Account[];
  transactions: Transaction[];
} | null = null;
registerMemoryCacheClearer(() => {
  cachedDashboard = null;
});

const DashboardOverview: React.FC<{ onRefreshKey: number }> = ({ onRefreshKey }) => {
  const { user } = useAuth();
  const userId = user?.uid || 'guest-user';

  const [timeFilter, setTimeFilter] = useState<string>('month');
  const [rawAccounts, setRawAccounts] = useState<Account[]>(() => {
    return cachedDashboard && cachedDashboard.userId === userId ? cachedDashboard.accounts : [];
  });
  const [rawTransactions, setRawTransactions] = useState<Transaction[]>(() => {
    return cachedDashboard && cachedDashboard.userId === userId ? cachedDashboard.transactions : [];
  });
  const [loading, setLoading] = useState<boolean>(() => {
    // If we have cached memory data for this user, display immediately with 0ms loading
    return !(cachedDashboard && cachedDashboard.userId === userId);
  });

  // Real-time cache-first synchronization: Firestore local cache fires in < 10ms
  useEffect(() => {
    let unsubAccounts: (() => void) | undefined;
    let unsubTransactions: (() => void) | undefined;

    let accLoaded = false;
    let txLoaded = false;

    const checkComplete = () => {
      if (accLoaded && txLoaded) {
        setLoading(false);
      }
    };

    if (accountRepo.subscribe) {
      unsubAccounts = accountRepo.subscribe(
        userId,
        (accs) => {
          setRawAccounts(accs);
          accLoaded = true;
          if (cachedDashboard) {
            cachedDashboard.accounts = accs;
          } else {
            cachedDashboard = { userId, accounts: accs, transactions: [] };
          }
          checkComplete();
        },
        (err) => {
          console.warn('[Dashboard] Account subscribe fallback:', err);
          accLoaded = true;
          checkComplete();
        }
      );
    } else {
      accountRepo.list(userId).then((accs) => {
        setRawAccounts(accs);
        accLoaded = true;
        checkComplete();
      });
    }

    if (transactionRepo.subscribe) {
      unsubTransactions = transactionRepo.subscribe(
        userId,
        (txs) => {
          setRawTransactions(txs);
          txLoaded = true;
          if (cachedDashboard) {
            cachedDashboard.transactions = txs;
          } else {
            cachedDashboard = { userId, accounts: [], transactions: txs };
          }
          checkComplete();
        },
        (err) => {
          console.warn('[Dashboard] Transaction subscribe fallback:', err);
          txLoaded = true;
          checkComplete();
        }
      );
    } else {
      transactionRepo.list(userId).then((txs) => {
        setRawTransactions(txs);
        txLoaded = true;
        checkComplete();
      });
    }

    return () => {
      if (unsubAccounts) unsubAccounts();
      if (unsubTransactions) unsubTransactions();
    };
  }, [userId, onRefreshKey]);

  // Derived financial metrics with instant zero-delay time horizon filtering
  const { totalCashMinor, totalInflowMinor, totalOutflowMinor } = useMemo(() => {
    const cash = rawAccounts.reduce((sum, a) => sum + (a.currentBalanceMinor || 0), 0);

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const monthPrefix = now.toISOString().slice(0, 7); // YYYY-MM

    let inflow = 0;
    let outflow = 0;

    for (const t of rawTransactions) {
      if (t.status === 'voided') continue;

      // Filter by user selected time horizon (Today / This Month / All Time)
      if (timeFilter === 'today') {
        const txDate = (t.date || '').slice(0, 10);
        if (txDate !== todayStr) continue;
      } else if (timeFilter === 'month') {
        const txMonth = (t.date || '').slice(0, 7);
        if (txMonth !== monthPrefix) continue;
      }

      if (t.type === 'income' || t.type === 'refund') {
        inflow += t.amountMinor || 0;
      } else if (t.type === 'expense') {
        outflow += t.amountMinor || 0;
      }
    }

    return { totalCashMinor: cash, totalInflowMinor: inflow, totalOutflowMinor: outflow };
  }, [rawAccounts, rawTransactions, timeFilter]);

  return (
    <div className="space-y-4 pb-20">
      {/* Glisse Official Segmented Control - sized to 105px per tab for perfect label fit & thumb alignment */}
      <div className="flex justify-center w-full">
        <SegmentedControl
          items={[
            { value: 'today', label: 'Today' },
            { value: 'month', label: 'This Month' },
            { value: 'all', label: 'All Time' },
          ]}
          value={timeFilter}
          onValueChange={(val) => {
            if (val) setTimeFilter(val);
          }}
          style={{ '--lg-tab-width': '105px' } as React.CSSProperties}
        />
      </div>

      {/* Glisse Official Glass Card */}
      <Glass className="p-5 rounded-2xl space-y-4">
        <div>
          <span className="text-[11px] font-bold tracking-wider text-[var(--lg-muted)] uppercase">
            Net Cash Position
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-3xl font-black text-[var(--lg-foreground)] tabular-nums tracking-tight">
              {loading ? (
                <span className="inline-flex items-center">
                  Rs <LoadingDots size="md" />
                </span>
              ) : (
                Money.format(totalCashMinor)
              )}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-3 border-t border-[var(--lg-separator)] text-xs">
          <div>
            <span className="text-[var(--lg-muted)] font-medium flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-emerald-500" /> Total Inflow
            </span>
            <p className="font-extrabold text-emerald-600 dark:text-emerald-400 text-sm mt-0.5 tabular-nums">
              {loading ? (
                <span className="inline-flex items-center">
                  Rs <LoadingDots size="sm" />
                </span>
              ) : (
                Money.format(totalInflowMinor)
              )}
            </p>
          </div>
          <div>
            <span className="text-[var(--lg-muted)] font-medium flex items-center gap-1">
              <TrendingDown className="w-3 h-3 text-rose-500" /> Total Outflow
            </span>
            <p className="font-extrabold text-rose-600 dark:text-rose-400 text-sm mt-0.5 tabular-nums">
              {loading ? (
                <span className="inline-flex items-center">
                  Rs <LoadingDots size="sm" />
                </span>
              ) : (
                Money.format(totalOutflowMinor)
              )}
            </p>
          </div>
        </div>
      </Glass>

      {/* Glisse Official Status Notice */}
      <Glass className="p-4 rounded-2xl flex items-start gap-3 text-xs">
        <ShieldCheck className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-bold text-[var(--lg-foreground)] text-sm">Apple Liquid Glass Active</p>
          <p className="mt-1 text-[var(--lg-muted)] leading-relaxed font-normal">
            Multi-project construction ledger and personal finance with offline cache synchronization.
          </p>
        </div>
      </Glass>

      {/* Contacts live here now (Contacts tab moved into Overview; Profile took its place in the bottom bar) */}
      <div className="pt-2">
        <ContactsView />
      </div>
    </div>
  );
};

const VALID_TABS: NavTab[] = ['dashboard', 'projects', 'accounts', 'profile'];
const LAST_TAB_STORAGE_KEY = 'ledger_last_tab';

// Every bottom-bar screen has its own hash route so reloads and back/forward stay on the same screen.
// Legacy '#/contacts' now lives on the Overview screen.
function parseHashRoute(): NavTab | null {
  if (typeof window === 'undefined') return null;
  const raw = window.location.hash.replace(/^#\/?/, '').toLowerCase();
  if (raw === 'contacts') return 'dashboard';
  if (VALID_TABS.includes(raw as NavTab)) return raw as NavTab;
  return null;
}

function getSavedTab(): NavTab {
  try {
    const saved = sessionStorage.getItem(LAST_TAB_STORAGE_KEY) as NavTab | null;
    if (saved && VALID_TABS.includes(saved)) return saved;
  } catch {
    // ignore storage errors
  }
  return 'dashboard';
}

function persistTab(tab: NavTab) {
  try {
    sessionStorage.setItem(LAST_TAB_STORAGE_KEY, tab);
  } catch {
    // ignore
  }
}

const TAB_TITLES: Record<NavTab, string> = {
  dashboard: 'Financial Overview',
  projects: 'Project Portfolios',
  accounts: 'Liquidity & Accounts',
  profile: 'Profile',
};

export const AppContent: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<NavTab>(() => parseHashRoute() ?? getSavedTab());
  const [isQuickAddOpen, setIsQuickAddOpen] = useState<boolean>(false);
  const [refreshKey, setRefreshKey] = useState<number>(0);

  // Make sure the URL always reflects the current screen (also normalizes empty / legacy hashes)
  useEffect(() => {
    const targetHash = `#/${currentTab}`;
    if (window.location.hash !== targetHash) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${targetHash}`);
    }
    persistTab(currentTab);
  }, [currentTab]);

  // Sync with browser hash navigation (supports native back/forward)
  useEffect(() => {
    const handleHashChange = () => {
      const tab = parseHashRoute();
      if (tab) setCurrentTab(tab);
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleTabChange = (tab: NavTab) => {
    setCurrentTab(tab);
    persistTab(tab);
    const targetHash = `#/${tab}`;
    if (window.location.hash !== targetHash) {
      window.location.hash = targetHash;
    }
  };

  return (
    <>
      <MobileAppLayout
        currentTab={currentTab}
        onTabChange={handleTabChange}
        onQuickAdd={() => setIsQuickAddOpen(true)}
        title={TAB_TITLES[currentTab]}
      >
        {currentTab === 'dashboard' && <DashboardOverview onRefreshKey={refreshKey} />}
        {currentTab === 'projects' && <ProjectsView />}
        {currentTab === 'accounts' && <AccountsView />}
        {currentTab === 'profile' && <ProfileView />}
      </MobileAppLayout>

      <QuickAddModal
        isOpen={isQuickAddOpen}
        onClose={() => setIsQuickAddOpen(false)}
        onSuccess={() => setRefreshKey((k) => k + 1)}
      />
    </>
  );
};

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <SnackbarProvider>
        <AuthProvider>
          <SyncProvider>
            <AppContent />
          </SyncProvider>
        </AuthProvider>
      </SnackbarProvider>
    </ThemeProvider>
  );
};

export default App;
