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
    <div className="flex flex-col h-[100dvh] w-full bg-background-light dark:bg-background text-slate-900 dark:text-slate-100 overflow-hidden font-sans transition-colors duration-200">
      {/* Glisse Liquid Glass Top App Bar */}
      <TopHeader title={title} subtitle={subtitle} />

      {/* Main View with Dedicated Pull-To-Refresh */}
      <PullToRefresh>
        <main className="max-w-md mx-auto w-full px-4 pt-4 pb-28">
          {children}
        </main>
      </PullToRefresh>

      {/* Glisse Floating Liquid Glass Bottom Navigation */}
      <BottomNavigation
        currentTab={currentTab}
        onTabChange={onTabChange}
        onQuickAdd={onQuickAdd}
      />
    </div>
  );
};
