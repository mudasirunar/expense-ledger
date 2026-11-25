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
        {currentTab === 'dashboard' && (
          <DashboardView
            onRefreshKey={refreshKey}
            onNavigateTab={(tab) => handleTabChange(tab)}
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
