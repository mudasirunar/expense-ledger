import React from 'react';
import { LayoutDashboard, Building2, Plus, Users, Wallet } from 'lucide-react';

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
  return (
    <nav 
      aria-label="Bottom Navigation"
      className="fixed bottom-0 left-0 right-0 z-40 bg-surface/95 backdrop-blur-lg border-t border-border/70 pb-[env(safe-area-inset-bottom)]"
    >
      <div className="max-w-md mx-auto px-3 h-16 flex items-center justify-around">
        {/* Dashboard Tab */}
        <button
          onClick={() => onTabChange('dashboard')}
          aria-label="Dashboard"
          className={`flex flex-col items-center justify-center flex-1 py-1 min-w-[50px] min-h-[44px] transition-colors ${
            currentTab === 'dashboard' ? 'text-blue-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <LayoutDashboard className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">Dashboard</span>
        </button>

        {/* Projects Tab */}
        <button
          onClick={() => onTabChange('projects')}
          aria-label="Projects"
          className={`flex flex-col items-center justify-center flex-1 py-1 min-w-[50px] min-h-[44px] transition-colors ${
            currentTab === 'projects' ? 'text-blue-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Building2 className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">Projects</span>
        </button>

        {/* Quick Add Floating Center Button */}
        <div className="flex-1 flex items-center justify-center -mt-5">
          <button
            onClick={onQuickAdd}
            aria-label="Record new transaction or obligation"
            className="w-13 h-13 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center shadow-lg shadow-blue-900/40 border-4 border-background active:scale-95 transition-all p-3"
          >
            <Plus className="w-6 h-6 stroke-[2.5]" />
          </button>
        </div>

        {/* Contacts Tab */}
        <button
          onClick={() => onTabChange('contacts')}
          aria-label="Contacts"
          className={`flex flex-col items-center justify-center flex-1 py-1 min-w-[50px] min-h-[44px] transition-colors ${
            currentTab === 'contacts' ? 'text-blue-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Users className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">Contacts</span>
        </button>

        {/* Accounts Tab */}
        <button
          onClick={() => onTabChange('accounts')}
          aria-label="Accounts and Wallets"
          className={`flex flex-col items-center justify-center flex-1 py-1 min-w-[50px] min-h-[44px] transition-colors ${
            currentTab === 'accounts' ? 'text-blue-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Wallet className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">Accounts</span>
        </button>
      </div>
    </nav>
  );
};

