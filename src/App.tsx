import React, { useState } from 'react';
import { SyncProvider } from './app/providers/SyncProvider';
import { MobileAppLayout } from './app/layouts/MobileAppLayout';
import { NavTab } from '@/components/layout/BottomNavigation';
import { ShieldCheck, Plus, Building2, Users, Wallet, ArrowRightLeft } from 'lucide-react';

const DashboardPlaceholder: React.FC = () => (
  <div className="space-y-4">
    <div className="bg-gradient-to-br from-surface to-surface-elevated p-4 rounded-2xl border border-border shadow-md">
      <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Net Cash Position</span>
      <div className="flex items-baseline gap-2 mt-1">
        <span className="text-2xl font-black text-white tabular-nums tracking-tight">PKR 0.00</span>
      </div>
      <div className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t border-border/70 text-xs">
        <div>
          <span className="text-slate-400">Total Inflow</span>
          <p className="font-bold text-emerald-400 mt-0.5">PKR 0.00</p>
        </div>
        <div>
          <span className="text-slate-400">Total Outflow</span>
          <p className="font-bold text-rose-400 mt-0.5">PKR 0.00</p>
        </div>
      </div>
    </div>

    <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-start gap-2.5 text-xs text-blue-300">
      <ShieldCheck className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
      <div>
        <p className="font-semibold text-white">Phase 1 Foundation Active</p>
        <p className="mt-0.5 text-slate-300">Pull-to-refresh, bottom navigation, and safe-area mobile app shell are ready.</p>
      </div>
    </div>
  </div>
);

const ProjectsPlaceholder: React.FC = () => (
  <div className="space-y-3">
    <div className="flex items-center justify-between">
      <h2 className="text-sm font-bold text-white uppercase tracking-wider">Projects (0)</h2>
      <button className="flex items-center gap-1 bg-blue-600 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg">
        <Plus className="w-3.5 h-3.5" />
        <span>Add Project</span>
      </button>
    </div>
    <div className="bg-surface p-6 rounded-xl border border-border text-center space-y-2">
      <Building2 className="w-8 h-8 text-slate-500 mx-auto" />
      <p className="text-sm font-medium text-white">No projects created yet</p>
      <p className="text-xs text-slate-400">Projects will appear here with independent ledgers and budgets.</p>
    </div>
  </div>
);

const ContactsPlaceholder: React.FC = () => (
  <div className="space-y-3">
    <div className="flex items-center justify-between">
      <h2 className="text-sm font-bold text-white uppercase tracking-wider">Contacts (0)</h2>
      <button className="flex items-center gap-1 bg-blue-600 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg">
        <Plus className="w-3.5 h-3.5" />
        <span>Add Contact</span>
      </button>
    </div>
    <div className="bg-surface p-6 rounded-xl border border-border text-center space-y-2">
      <Users className="w-8 h-8 text-slate-500 mx-auto" />
      <p className="text-sm font-medium text-white">No contacts created yet</p>
      <p className="text-xs text-slate-400">Suppliers, contractors, and clients will be listed here.</p>
    </div>
  </div>
);

const AccountsPlaceholder: React.FC = () => (
  <div className="space-y-3">
    <div className="flex items-center justify-between">
      <h2 className="text-sm font-bold text-white uppercase tracking-wider">Accounts (0)</h2>
      <button className="flex items-center gap-1 bg-surface-elevated text-slate-200 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-border">
        <ArrowRightLeft className="w-3.5 h-3.5 text-blue-400" />
        <span>Transfer</span>
      </button>
    </div>
    <div className="bg-surface p-6 rounded-xl border border-border text-center space-y-2">
      <Wallet className="w-8 h-8 text-slate-500 mx-auto" />
      <p className="text-sm font-medium text-white">No accounts configured yet</p>
      <p className="text-xs text-slate-400">Cash drawers, bank accounts, and mobile wallets will appear here.</p>
    </div>
  </div>
);

export const App: React.FC = () => {
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
    <SyncProvider>
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
    </SyncProvider>
  );
};

export default App;
