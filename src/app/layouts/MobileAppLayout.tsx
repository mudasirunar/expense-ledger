import React from 'react';
import { TopHeader } from '@/components/layout/TopHeader';
import { BottomNavigation, NavTab } from '@/components/layout/BottomNavigation';
import { PullToRefresh } from '@/components/pwa/PullToRefresh';

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
  return (
    <div className="flex flex-col app-screen w-full bg-[#E2DDD5] dark:bg-background text-slate-900 dark:text-slate-100 overflow-hidden font-sans transition-colors duration-200">
      {/* Fully scrollable screen: status-bar spacer + top bar scroll up together with the content */}
      <PullToRefresh>
        <TopHeader title={title} subtitle={subtitle} />

        <main className="max-w-md mx-auto w-full px-4 pt-3 pb-24">
          {children}
        </main>
      </PullToRefresh>

      {/* Glisse Floating Liquid Glass Bottom Navigation at true bottom */}
      <BottomNavigation
        currentTab={currentTab}
        onTabChange={onTabChange}
        onQuickAdd={onQuickAdd}
      />
    </div>
  );
};
