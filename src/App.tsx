import React, { useState, useEffect } from 'react';
import { SyncProvider } from './app/providers/SyncProvider';
import { ThemeProvider } from './app/providers/ThemeProvider';
import { AuthProvider, useAuth } from './app/providers/AuthProvider';
import { MobileAppLayout } from './app/layouts/MobileAppLayout';
import { NavTab } from '@/components/layout/BottomNavigation';
import { ProjectsView } from '@/components/projects/ProjectsView';
import { ContactsView } from '@/components/contacts/ContactsView';
import { AccountsView } from '@/components/accounts/AccountsView';
import { QuickAddModal } from '@/components/entry/QuickAddModal';
import { FirestoreAccountRepository, FirestoreTransactionRepository } from '@/data/repositories/firestore';
import { Money } from '@/domain/accounting/money';
import { ShieldCheck, TrendingUp, TrendingDown } from 'lucide-react';
import { Glass, SegmentedControl } from 'glisse';

const accountRepo = new FirestoreAccountRepository();
const transactionRepo = new FirestoreTransactionRepository();

// Animated bouncing dots for loading currency metrics
const LoadingDots: React.FC<{ size?: 'sm' | 'md' }> = ({ size = 'md' }) => {
  const dotClass = size === 'sm' ? 'w-1 h-1' : 'w-1.5 h-1.5';
  return (
    <span className="inline-flex items-center gap-1 ml-1.5 align-middle">
      <span className={`${dotClass} rounded-full bg-current animate-bounce [animation-delay:-0.3s] opacity-75`} />
      <span className={`${dotClass} rounded-full bg-current animate-bounce [animation-delay:-0.15s] opacity-75`} />
      <span className={`${dotClass} rounded-full bg-current animate-bounce opacity-75`} />
    </span>
  );
};

const DashboardOverview: React.FC<{ onRefreshKey: number }> = ({ onRefreshKey }) => {
  const { user } = useAuth();
  const userId = user?.uid || 'guest-user';

  const [timeFilter, setTimeFilter] = useState<string>('month');
  const [totalCashMinor, setTotalCashMinor] = useState<number>(0);
  const [totalInflowMinor, setTotalInflowMinor] = useState<number>(0);
  const [totalOutflowMinor, setTotalOutflowMinor] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    Promise.all([
      accountRepo.list(userId),
      transactionRepo.list(userId),
    ]).then(([accs, txs]) => {
      if (!isMounted) return;

      const cash = accs.reduce((sum, a) => sum + a.currentBalanceMinor, 0);
      setTotalCashMinor(cash);

      let inflow = 0;
      let outflow = 0;
      for (const t of txs) {
        if (t.status === 'voided') continue;
        if (t.type === 'income' || t.type === 'refund') {
          inflow += t.amountMinor;
        } else if (t.type === 'expense') {
          outflow += t.amountMinor;
        }
      }

      setTotalInflowMinor(inflow);
      setTotalOutflowMinor(outflow);
      setLoading(false);
    }).catch((err) => {
      console.warn('[Dashboard] Load fallback:', err);
      if (isMounted) setLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, [userId, onRefreshKey]);

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
                  PKR <LoadingDots size="md" />
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
                  PKR <LoadingDots size="sm" />
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
                  PKR <LoadingDots size="sm" />
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
    </div>
  );
};

export const AppContent: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');
  const [isQuickAddOpen, setIsQuickAddOpen] = useState<boolean>(false);
  const [refreshKey, setRefreshKey] = useState<number>(0);

  const getHeaderMeta = () => {
    switch (currentTab) {
      case 'dashboard':
        return { title: 'Financial Overview', subtitle: 'Executive cash & project balance' };
      case 'projects':
        return { title: 'Project Portfolios', subtitle: 'Multi-Project Ledgers' };
      case 'contacts':
        return { title: 'Contacts & Parties', subtitle: 'Suppliers, Contractors, Clients' };
      case 'accounts':
        return { title: 'Liquidity & Accounts', subtitle: 'Cash, Banks & Mobile Wallets' };
      default:
        return { title: 'Expense Ledger', subtitle: 'Accounting PWA' };
    }
  };

  const { title, subtitle } = getHeaderMeta();

  return (
    <>
      <MobileAppLayout
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        onQuickAdd={() => setIsQuickAddOpen(true)}
        title={title}
        subtitle={subtitle}
      >
        {currentTab === 'dashboard' && <DashboardOverview onRefreshKey={refreshKey} />}
        {currentTab === 'projects' && <ProjectsView />}
        {currentTab === 'contacts' && <ContactsView />}
        {currentTab === 'accounts' && <AccountsView />}
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
      <AuthProvider>
        <SyncProvider>
          <AppContent />
        </SyncProvider>
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
