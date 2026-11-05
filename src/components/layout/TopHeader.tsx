import React from 'react';
import { RotateCw, WifiOff, Cloud, RefreshCw } from 'lucide-react';
import { useSync } from '@/app/providers/SyncProvider';

interface TopHeaderProps {
  title: string;
  subtitle?: string;
}

export const TopHeader: React.FC<TopHeaderProps> = ({ title, subtitle }) => {
  const { isOnline, pendingWritesCount, triggerManualRefresh, isRefreshing } = useSync();

  return (
    <header className="sticky top-0 z-30 w-full bg-surface border-b border-border/60 px-4 py-3 flex items-center justify-between select-none backdrop-blur-md bg-opacity-90">
      <div>
        <h1 className="text-base font-bold text-white tracking-tight">{title}</h1>
        {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-2">
        {/* Network & Sync Status Pill */}
        {!isOnline ? (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <WifiOff className="w-3 h-3" />
            <span>Offline</span>
          </div>
        ) : pendingWritesCount > 0 ? (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Cloud className="w-3 h-3 animate-pulse" />
            <span>Syncing ({pendingWritesCount})</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            <span>Synced</span>
          </div>
        )}

        {/* Accessible Manual Refresh Button */}
        <button
          onClick={() => triggerManualRefresh()}
          disabled={isRefreshing}
          aria-label="Refresh financial records"
          className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 active:scale-95 transition-all disabled:opacity-50 min-w-[40px] min-h-[40px] flex items-center justify-center"
        >
          {isRefreshing ? (
            <RotateCw className="w-4 h-4 animate-spin text-blue-400" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
        </button>
      </div>
    </header>
  );
};

