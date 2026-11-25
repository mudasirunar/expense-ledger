import React, { useState, useEffect } from 'react';
import { SyncProvider } from './app/providers/SyncProvider';
import { ThemeProvider } from './app/providers/ThemeProvider';
import { AuthProvider } from './app/providers/AuthProvider';
import { SnackbarProvider } from './app/providers/SnackbarProvider';
import { MobileAppLayout } from './app/layouts/MobileAppLayout';
import { NavTab } from '@/components/layout/BottomNavigation';
import { DashboardView } from '@/components/dashboard/DashboardView';
import { ProjectsView } from '@/components/projects/ProjectsView';
import { AccountsView } from '@/components/accounts/AccountsView';
import { QuickAddModal } from '@/components/entry/QuickAddModal';
import { ProfileView } from '@/components/profile/ProfileView';
import { HistoryView } from '@/components/history/HistoryView';
import { FinancialReportsView } from '@/components/reports/FinancialReportsView';
import { SearchView } from '@/components/search/SearchView';
import { BillsFilter, BillsView } from '@/components/bills/BillsView';

const VALID_TABS: NavTab[] = ['dashboard', 'projects', 'accounts', 'profile'];
const LAST_TAB_STORAGE_KEY = 'ledger_last_tab';

type AppRoute =
  | { screen: 'tabs'; tab: NavTab }
  | { screen: 'history' }
  | { screen: 'reports' }
  | { screen: 'search' }
  | { screen: 'bills'; billId?: string };

// Every screen has its own hash route so reloads and back/forward stay on the same screen.
// Legacy '#/contacts' now lives on the Overview screen.
function parseHashRoute(): AppRoute | null {
  if (typeof window === 'undefined') return null;
  const rawOriginal = window.location.hash.replace(/^#\/?/, '');
  const raw = rawOriginal.toLowerCase();
  if (raw === 'history') return { screen: 'history' };
  if (raw === 'reports') return { screen: 'reports' };
  if (raw === 'search' || raw.startsWith('search/')) return { screen: 'search' };
  if (raw === 'bills') return { screen: 'bills' };
  if (raw.startsWith('bills/') && rawOriginal.length > 6) {
    return { screen: 'bills', billId: decodeURIComponent(rawOriginal.slice(6)) };
  }
  if (raw === 'contacts') return { screen: 'tabs', tab: 'dashboard' };
  if (VALID_TABS.includes(raw as NavTab)) return { screen: 'tabs', tab: raw as NavTab };
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
  const initialRoute = parseHashRoute();
  const [currentTab, setCurrentTab] = useState<NavTab>(() =>
    initialRoute?.screen === 'tabs' ? initialRoute.tab : getSavedTab()
  );
  const [standaloneScreen, setStandaloneScreen] = useState<'history' | 'reports' | 'search' | 'bills' | null>(() => {
    if (initialRoute?.screen === 'history') return 'history';
    if (initialRoute?.screen === 'reports') return 'reports';
    if (initialRoute?.screen === 'search') return 'search';
    if (initialRoute?.screen === 'bills') return 'bills';
    return null;
  });
  const [isQuickAddOpen, setIsQuickAddOpen] = useState<boolean>(false);
  const [billsInitialFilter, setBillsInitialFilter] = useState<BillsFilter>('open');
  const [selectedBillId, setSelectedBillId] = useState<string | null>(() =>
    initialRoute?.screen === 'bills' ? initialRoute.billId ?? null : null
  );
  const [refreshKey, setRefreshKey] = useState<number>(0);

  // Make sure the URL always reflects the current screen (also normalizes empty / legacy hashes)
  useEffect(() => {
    const targetHash =
      standaloneScreen === 'history'
        ? '#/history'
        : standaloneScreen === 'reports'
          ? '#/reports'
          : standaloneScreen === 'search'
            ? '#/search'
            : standaloneScreen === 'bills'
              ? selectedBillId
                ? `#/bills/${encodeURIComponent(selectedBillId)}`
                : '#/bills'
              : `#/${currentTab}`;
    if (
      standaloneScreen === 'search' &&
      window.location.hash.toLowerCase().startsWith('#/search/')
    ) {
      return;
    }
    if (window.location.hash !== targetHash) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${targetHash}`);
    }
    if (!standaloneScreen) {
      persistTab(currentTab);
    }
  }, [currentTab, standaloneScreen, selectedBillId]);

  // Sync with browser hash navigation (supports native back/forward)
  useEffect(() => {
    const handleHashChange = () => {
      const route = parseHashRoute();
      if (!route) return;
      if (route.screen === 'history') {
        setSelectedBillId(null);
        setStandaloneScreen('history');
      } else if (route.screen === 'reports') {
        setSelectedBillId(null);
        setStandaloneScreen('reports');
      } else if (route.screen === 'search') {
        setSelectedBillId(null);
        setStandaloneScreen('search');
      } else if (route.screen === 'bills') {
        setStandaloneScreen('bills');
        setSelectedBillId(route.billId ?? null);
      } else {
        setSelectedBillId(null);
        setStandaloneScreen(null);
        setCurrentTab(route.tab);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleTabChange = (tab: NavTab) => {
    setStandaloneScreen(null);
    setCurrentTab(tab);
    persistTab(tab);
    const targetHash = `#/${tab}`;
    if (window.location.hash !== targetHash) {
      window.location.hash = targetHash;
    }
  };

  const handleOpenHistory = () => {
    persistTab(currentTab);
    setStandaloneScreen('history');
    if (window.location.hash !== '#/history') {
      window.location.hash = '#/history';
    }
  };

  const handleOpenReports = () => {
    persistTab(currentTab);
    setStandaloneScreen('reports');
    if (window.location.hash !== '#/reports') {
      window.location.hash = '#/reports';
    }
  };

  const handleOpenSearch = () => {
    persistTab(currentTab);
    setStandaloneScreen('search');
    if (window.location.hash !== '#/search') {
      window.location.hash = '#/search';
    }
  };

  const handleOpenBills = (initialFilter: BillsFilter = 'open') => {
    persistTab(currentTab);
    setBillsInitialFilter(initialFilter);
    setSelectedBillId(null);
    setStandaloneScreen('bills');
    if (window.location.hash !== '#/bills') {
      window.location.hash = '#/bills';
    }
  };

  const handleSelectBill = (billId: string) => {
    setSelectedBillId(billId);
    const targetHash = `#/bills/${encodeURIComponent(billId)}`;
    if (window.location.hash !== targetHash) {
      window.location.hash = targetHash;
    }
  };

  const handleCloseBillDetail = () => {
    setSelectedBillId(null);
    if (window.location.hash !== '#/bills') {
      window.location.hash = '#/bills';
    }
  };

  const handleBackFromStandalone = () => {
    const returnTab = currentTab || getSavedTab();
    setStandaloneScreen(null);
    const targetHash = `#/${returnTab}`;
    if (window.location.hash !== targetHash) {
      window.location.hash = targetHash;
    }
  };

  if (standaloneScreen === 'history') {
    return <HistoryView onBack={handleBackFromStandalone} />;
  }

  if (standaloneScreen === 'reports') {
    return <FinancialReportsView onBack={handleBackFromStandalone} />;
  }

  if (standaloneScreen === 'search') {
    return <SearchView onBack={handleBackFromStandalone} />;
  }

  if (standaloneScreen === 'bills') {
    return (
      <BillsView
        onBack={handleBackFromStandalone}
        initialFilter={billsInitialFilter}
        selectedBillId={selectedBillId}
        onSelectBill={handleSelectBill}
        onCloseBillDetail={handleCloseBillDetail}
      />
    );
  }

  return (
    <>
      <MobileAppLayout
        currentTab={currentTab}
        onTabChange={handleTabChange}
        onQuickAdd={() => setIsQuickAddOpen(true)}
        onOpenSearch={handleOpenSearch}
        title={TAB_TITLES[currentTab]}
      >
        {currentTab === 'dashboard' && (
          <DashboardView
            onRefreshKey={refreshKey}
            onNavigateTab={(tab) => handleTabChange(tab)}
            onOpenHistory={handleOpenHistory}
            onOpenBills={handleOpenBills}
          />
        )}
        {currentTab === 'projects' && <ProjectsView />}
        {currentTab === 'accounts' && <AccountsView />}
        {currentTab === 'profile' && <ProfileView onOpenReports={handleOpenReports} />}
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
