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

const VALID_TABS: NavTab[] = ['dashboard', 'projects', 'accounts', 'profile'];
const LAST_TAB_STORAGE_KEY = 'ledger_last_tab';

type AppRoute = { screen: 'tabs'; tab: NavTab } | { screen: 'history' };

// Every screen has its own hash route so reloads and back/forward stay on the same screen.
// Legacy '#/contacts' now lives on the Overview screen.
function parseHashRoute(): AppRoute | null {
  if (typeof window === 'undefined') return null;
  const raw = window.location.hash.replace(/^#\/?/, '').toLowerCase();
  if (raw === 'history') return { screen: 'history' };
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
  const [isHistoryScreen, setIsHistoryScreen] = useState<boolean>(
    () => initialRoute?.screen === 'history'
  );
  const [isQuickAddOpen, setIsQuickAddOpen] = useState<boolean>(false);
  const [refreshKey, setRefreshKey] = useState<number>(0);

  // Make sure the URL always reflects the current screen (also normalizes empty / legacy hashes)
  useEffect(() => {
    const targetHash = isHistoryScreen ? '#/history' : `#/${currentTab}`;
    if (window.location.hash !== targetHash) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${targetHash}`);
    }
    if (!isHistoryScreen) {
      persistTab(currentTab);
    }
  }, [currentTab, isHistoryScreen]);

  // Sync with browser hash navigation (supports native back/forward)
  useEffect(() => {
    const handleHashChange = () => {
      const route = parseHashRoute();
      if (!route) return;
      if (route.screen === 'history') {
        setIsHistoryScreen(true);
      } else {
        setIsHistoryScreen(false);
        setCurrentTab(route.tab);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleTabChange = (tab: NavTab) => {
    setIsHistoryScreen(false);
    setCurrentTab(tab);
    persistTab(tab);
    const targetHash = `#/${tab}`;
    if (window.location.hash !== targetHash) {
      window.location.hash = targetHash;
    }
  };

  const handleOpenHistory = () => {
    persistTab(currentTab);
    setIsHistoryScreen(true);
    if (window.location.hash !== '#/history') {
      window.location.hash = '#/history';
    }
  };

  const handleBackFromHistory = () => {
    const returnTab = currentTab || getSavedTab();
    setIsHistoryScreen(false);
    const targetHash = `#/${returnTab}`;
    if (window.location.hash !== targetHash) {
      window.location.hash = targetHash;
    }
  };

  if (isHistoryScreen) {
    return <HistoryView onBack={handleBackFromHistory} />;
  }

  return (
    <>
      <MobileAppLayout
        currentTab={currentTab}
        onTabChange={handleTabChange}
        onQuickAdd={() => setIsQuickAddOpen(true)}
        title={TAB_TITLES[currentTab]}
      >
        {currentTab === 'dashboard' && (
          <DashboardView
            onRefreshKey={refreshKey}
            onNavigateTab={(tab) => handleTabChange(tab)}
            onOpenHistory={handleOpenHistory}
          />
        )}
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
