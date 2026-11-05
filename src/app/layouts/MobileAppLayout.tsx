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
    <div className="flex flex-col h-screen w-full bg-background text-slate-100 overflow-hidden font-sans">
      {/* Top App Bar */}
      <TopHeader title={title} subtitle={subtitle} />

      {/* Main View with Dedicated Pull-To-Refresh */}
      <PullToRefresh>
        <main className="max-w-md mx-auto w-full px-4 pt-4 pb-24">
          {children}
        </main>
      </PullToRefresh>

      {/* Fixed Bottom Navigation */}
      <BottomNavigation
        currentTab={currentTab}
        onTabChange={onTabChange}
        onQuickAdd={onQuickAdd}
      />
    </div>
  );
};

