import React from 'react';
import { LayoutDashboard, Building2, Plus, Users, Wallet } from 'lucide-react';
import { TabBar, Button } from 'glisse';

export type NavTab = 'dashboard' | 'projects' | 'contacts' | 'accounts';

interface BottomNavigationProps {
  currentTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  onQuickAdd: () => void;
}

export const BottomNavigation: React.FC<BottomNavigationProps> = ({
  currentTab,
  onTabChange,
  onQuickAdd,
}) => {
  const tabItems = [
    {
      value: 'dashboard',
      label: 'Overview',
      icon: <LayoutDashboard className="w-[21px] h-[21px]" />,
    },
    {
      value: 'projects',
      label: 'Projects',
      icon: <Building2 className="w-[21px] h-[21px]" />,
    },
    {
      value: 'contacts',
      label: 'Contacts',
      icon: <Users className="w-[21px] h-[21px]" />,
    },
    {
      value: 'accounts',
      label: 'Accounts',
      icon: <Wallet className="w-[21px] h-[21px]" />,
    },
  ];

  return (
    <nav
      aria-label="Bottom Navigation"
      className="fixed left-0 right-0 z-40 pointer-events-none flex justify-center px-4"
      style={{
        bottom: 'max(0.75rem, calc(env(safe-area-inset-bottom, 0px) - 12px))',
      }}
    >
      {/* Glisse Apple Liquid Glass Dock: Scales responsively to align cleanly with main card edges on all iPhone / Android / Desktop widths */}
      <div className="w-full max-w-md flex items-center justify-between gap-2.5 pointer-events-auto">
        <TabBar
          items={tabItems}
          value={currentTab}
          onValueChange={(val) => {
            if (val) onTabChange(val as NavTab);
          }}
          className="flex-1"
          style={{
            '--lg-tab-width': 'clamp(66px, calc((100vw - 110px) / 4), 84px)',
            '--lg-tab-height': '54px',
          } as React.CSSProperties}
        />

        {/* Glisse Official Filled Button for Quick Add */}
        <Button
          variant="filled"
          tint="#2563EB"
          aria-label="Record new transaction or obligation"
          onClick={onQuickAdd}
          icon={<Plus className="w-6 h-6 stroke-[2.5]" />}
          className="!rounded-full !w-[54px] !h-[54px] !p-0 shadow-lg shadow-blue-600/30 flex-shrink-0"
        />
      </div>
    </nav>
  );
};
