import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { TopHeader } from '@/components/layout/TopHeader';
import { BottomNavigation, NavTab } from '@/components/layout/BottomNavigation';
import { PullToRefresh } from '@/components/pwa/PullToRefresh';

// Per-tab scroll positions persisted across tab switches and screen transitions (e.g. History -> back)
const savedTabScrollPositions: Record<NavTab, number> = {
  dashboard: 0,
  projects: 0,
  accounts: 0,
  profile: 0,
};

interface MobileAppLayoutProps {
  currentTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  onQuickAdd: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export const MobileAppLayout: React.FC<MobileAppLayoutProps> = ({
  currentTab,
  onTabChange,
  onQuickAdd,
  title,
  subtitle,
  children
}) => {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const autoRefreshRef = useRef<(() => void) | null>(null);
  const activeTabRef = useRef<NavTab>(currentTab);

  // Track the active tab's scroll position independently
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      savedTabScrollPositions[activeTabRef.current] = container.scrollTop;
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // Restore each tab's own scroll position synchronously before paint on tab switch
  useLayoutEffect(() => {
    activeTabRef.current = currentTab;
    const container = scrollContainerRef.current;
    if (!container) return;
    container.scrollTop = savedTabScrollPositions[currentTab] ?? 0;
  }, [currentTab]);

  const handleTabSelect = (tab: NavTab) => {
    if (tab === currentTab) {
      const container = scrollContainerRef.current;
      if (container && container.scrollTop > 1) {
        if (typeof container.scrollTo === 'function') {
          container.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          container.scrollTop = 0;
        }
      } else {
        autoRefreshRef.current?.();
      }
      return;
    }
    const container = scrollContainerRef.current;
    if (container) {
      savedTabScrollPositions[currentTab] = container.scrollTop;
    }
    onTabChange(tab);
  };

  return (
    <div className="flex flex-col app-screen w-full bg-[#E2DDD5] dark:bg-background text-slate-900 dark:text-slate-100 overflow-hidden font-sans transition-colors duration-200">
      {/* Fully scrollable screen: status-bar spacer + top bar scroll up together with the content */}
      <PullToRefresh
        scrollContainerRef={scrollContainerRef}
        autoRefreshRef={autoRefreshRef}
      >
        <TopHeader title={title} subtitle={subtitle} />

        <main className="max-w-md mx-auto w-full px-4 pt-3 pb-24">
          {children}
        </main>
      </PullToRefresh>

      {/* Glisse Floating Liquid Glass Bottom Navigation at true bottom */}
      <BottomNavigation
        currentTab={currentTab}
        onTabChange={handleTabSelect}
        onQuickAdd={onQuickAdd}
      />
    </div>
  );
};
