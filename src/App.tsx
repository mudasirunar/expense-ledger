import React, { useState } from 'react';
import { SyncProvider } from './app/providers/SyncProvider';
import { ThemeProvider } from './app/providers/ThemeProvider';
import { MobileAppLayout } from './app/layouts/MobileAppLayout';
import { NavTab } from '@/components/layout/BottomNavigation';
import { ShieldCheck, Plus, Building2, Users, Wallet, ArrowRightLeft } from 'lucide-react';
import { Glass, SegmentedControl, Button } from 'glisse';

const DashboardPlaceholder: React.FC = () => {
  const [timeFilter, setTimeFilter] = useState<string>('month');

  return (
    <div className="space-y-4">
      {/* Glisse Official Segmented Control - sized to 105px per tab for perfect label fit & thumb alignment */}
      <div className="flex justify-center w-full">
        <SegmentedControl
          items={[
            { value: 'today', label: 'Today' },
            { value: 'month', label: 'This Month' },
            { value: 'all', label: 'All Time' },
          ]}
          value={timeFilter}
          onValueChange={(val) => {
            if (val) setTimeFilter(val);
          }}
          style={{ '--lg-tab-width': '105px' } as React.CSSProperties}
        />
      </div>

      {/* Glisse Official Glass Card */}
      <Glass className="p-5 rounded-2xl space-y-4">
        <div>
          <span className="text-[11px] font-bold tracking-wider text-[var(--lg-muted)] uppercase">
            Net Cash Position
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-3xl font-black text-[var(--lg-foreground)] tabular-nums tracking-tight">
              PKR 0.00
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-3 border-t border-[var(--lg-separator)] text-xs">
          <div>
            <span className="text-[var(--lg-muted)] font-medium">Total Inflow</span>
            <p className="font-extrabold text-emerald-600 dark:text-emerald-400 text-sm mt-0.5 tabular-nums">
              PKR 0.00
            </p>
          </div>
          <div>
            <span className="text-[var(--lg-muted)] font-medium">Total Outflow</span>
            <p className="font-extrabold text-rose-600 dark:text-rose-400 text-sm mt-0.5 tabular-nums">
              PKR 0.00
            </p>
          </div>
        </div>
      </Glass>

      {/* Glisse Official Status Notice */}
      <Glass className="p-4 rounded-2xl flex items-start gap-3 text-xs">
        <ShieldCheck className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-bold text-[var(--lg-foreground)] text-sm">Apple Liquid Glass Active</p>
          <p className="mt-1 text-[var(--lg-muted)] leading-relaxed font-normal">
            Official Glisse components with native Light & Dark theme adaptability and zero flicker.
          </p>
        </div>
      </Glass>
    </div>
  );
};

const ProjectsPlaceholder: React.FC = () => (
  <div className="space-y-4">
    <div className="flex items-center justify-between">
      <h2 className="text-xs font-bold text-[var(--lg-muted)] uppercase tracking-wider">
        Projects (0)
      </h2>
      <Button
        variant="filled"
        tint="#2563EB"
        icon={<Plus className="w-3.5 h-3.5" />}
        onClick={() => console.log('Add Project')}
      >
        New Project
      </Button>
    </div>
    <Glass className="p-8 text-center space-y-2.5 rounded-2xl">
      <Building2 className="w-10 h-10 text-[var(--lg-muted)] mx-auto opacity-70" />
      <p className="text-sm font-bold text-[var(--lg-foreground)]">No projects created yet</p>
      <p className="text-xs text-[var(--lg-muted)] max-w-xs mx-auto leading-relaxed">
        Projects will appear here with independent ledgers, material inventories, and budgets.
      </p>
    </Glass>
  </div>
);

const ContactsPlaceholder: React.FC = () => (
  <div className="space-y-4">
    <div className="flex items-center justify-between">
      <h2 className="text-xs font-bold text-[var(--lg-muted)] uppercase tracking-wider">
        Contacts (0)
      </h2>
      <Button
        variant="filled"
        tint="#2563EB"
        icon={<Plus className="w-3.5 h-3.5" />}
        onClick={() => console.log('Add Contact')}
      >
        New Contact
      </Button>
    </div>
    <Glass className="p-8 text-center space-y-2.5 rounded-2xl">
      <Users className="w-10 h-10 text-[var(--lg-muted)] mx-auto opacity-70" />
      <p className="text-sm font-bold text-[var(--lg-foreground)]">No contacts created yet</p>
      <p className="text-xs text-[var(--lg-muted)] max-w-xs mx-auto leading-relaxed">
        Subcontractors, suppliers, and clients will be listed here with payment histories.
      </p>
    </Glass>
  </div>
);

const AccountsPlaceholder: React.FC = () => (
  <div className="space-y-4">
    <div className="flex items-center justify-between">
      <h2 className="text-xs font-bold text-[var(--lg-muted)] uppercase tracking-wider">
        Accounts (0)
      </h2>
      <Button
        variant="glass"
        icon={<ArrowRightLeft className="w-3.5 h-3.5 text-blue-500" />}
        onClick={() => console.log('Transfer')}
      >
        Transfer
      </Button>
    </div>
    <Glass className="p-8 text-center space-y-2.5 rounded-2xl">
      <Wallet className="w-10 h-10 text-[var(--lg-muted)] mx-auto opacity-70" />
      <p className="text-sm font-bold text-[var(--lg-foreground)]">No accounts configured yet</p>
      <p className="text-xs text-[var(--lg-muted)] max-w-xs mx-auto leading-relaxed">
        Cash drawers, bank accounts, and mobile wallets will appear here.
      </p>
    </Glass>
  </div>
);

export const AppContent: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');

  const getHeaderMeta = () => {
    switch (currentTab) {
      case 'dashboard':
        return { title: 'Financial Overview', subtitle: 'Executive cash & project balance' };
      case 'projects':
        return { title: 'Project Portfolios', subtitle: 'Multi-Project Ledgers' };
      case 'contacts':
        return { title: 'Contacts & Parties', subtitle: 'Suppliers, Contractors, Clients' };
      case 'accounts':
        return { title: 'Liquidity & Accounts', subtitle: 'Cash, Banks & Mobile Wallets' };
      default:
        return { title: 'Expense Ledger', subtitle: 'Accounting PWA' };
    }
  };

  const { title, subtitle } = getHeaderMeta();

  return (
    <MobileAppLayout
      currentTab={currentTab}
      onTabChange={setCurrentTab}
      onQuickAdd={() => console.log('Quick Add triggered')}
      title={title}
      subtitle={subtitle}
    >
      {currentTab === 'dashboard' && <DashboardPlaceholder />}
      {currentTab === 'projects' && <ProjectsPlaceholder />}
      {currentTab === 'contacts' && <ContactsPlaceholder />}
      {currentTab === 'accounts' && <AccountsPlaceholder />}
    </MobileAppLayout>
  );
};

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <SyncProvider>
        <AppContent />
      </SyncProvider>
    </ThemeProvider>
  );
};

export default App;
