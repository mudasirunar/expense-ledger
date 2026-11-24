import React from 'react';
import { LayoutDashboard, Building2, Plus, User, Wallet } from 'lucide-react';
import { TabBar, Button } from 'glisse';
import { useSync } from '@/app/providers/SyncProvider';
import { useAuth } from '@/app/providers/AuthProvider';

export type NavTab = 'dashboard' | 'projects' | 'accounts' | 'profile';

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
  const { isOnline, pendingWritesCount } = useSync();
  const { user } = useAuth();
  const statusLabel = !isOnline
    ? 'Offline'
    : pendingWritesCount > 0
      ? `Syncing (${pendingWritesCount})`
      : 'Synced';
  const statusRingClass = !isOnline
    ? 'ring-2 ring-red-500 shadow-[0_0_8px_rgba(239,68,68,0.7)]'
    : pendingWritesCount > 0
      ? 'ring-2 ring-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.75)] animate-pulse'
      : 'ring-2 ring-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.65)]';

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
      value: 'accounts',
      label: 'Accounts',
      icon: <Wallet className="w-[21px] h-[21px]" />,
    },
    {
      value: 'profile',
      label: 'Profile',
      icon: (
        <span
          title={statusLabel}
          aria-label={`Profile (${statusLabel})`}
          className={`relative inline-flex items-center justify-center w-[26px] h-[26px] rounded-full overflow-hidden bg-[var(--lg-glass)] ${statusRingClass}`}
        >
          {user?.photoURL ? (
            <img
              src={user.photoURL}
              alt=""
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          ) : (
            <User className="w-[15px] h-[15px]" />
          )}
        </span>
      ),
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
          className="flex-none"
          style={{
            // Tabs fill the dock exactly: dock width (screen - 2rem padding, max 28rem) minus the 54px +
            // button, the 10px gap and the bar's 2x4px inset, split over 4 tabs. Any slack would leave
            // the tabs left-aligned inside the glass pill.
            '--lg-tab-width': 'calc((min(100vw - 2rem, 28rem) - 54px - 10px - 8px) / 4)',
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
