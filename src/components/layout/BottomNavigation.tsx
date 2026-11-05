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
      icon: <LayoutDashboard className="w-5 h-5" />,
    },
    {
      value: 'projects',
      label: 'Projects',
      icon: <Building2 className="w-5 h-5" />,
    },
    {
      value: 'contacts',
      label: 'Contacts',
      icon: <Users className="w-5 h-5" />,
    },
    {
      value: 'accounts',
      label: 'Accounts',
      icon: <Wallet className="w-5 h-5" />,
    },
  ];

  return (
    <nav 
      aria-label="Bottom Navigation"
      className="fixed bottom-0 left-0 right-0 z-40 pb-[max(0.75rem,env(safe-area-inset-bottom))] pointer-events-none flex justify-center px-3"
    >
      {/* Glisse Apple Liquid Glass Dock: Centered together with no desktop gap and no mobile squeeze */}
      <div className="flex items-center justify-center gap-2 pointer-events-auto">
        <TabBar
          items={tabItems}
          value={currentTab}
          onValueChange={(val) => {
            if (val) onTabChange(val as NavTab);
          }}
          style={{ '--lg-tab-width': '66px' } as React.CSSProperties}
        />

        {/* Glisse Official Filled Button for Quick Add */}
        <Button
          variant="filled"
          tint="#2563EB"
          aria-label="Record new transaction or obligation"
          onClick={onQuickAdd}
          icon={<Plus className="w-5 h-5 stroke-[2.5]" />}
          className="!rounded-full !w-12 !h-12 !p-0 shadow-lg shadow-blue-600/30 flex-shrink-0"
        />
      </div>
    </nav>
  );
};
