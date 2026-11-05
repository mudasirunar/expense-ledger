import React from 'react';
import { RotateCw, WifiOff, Cloud, RefreshCw, Sun, Moon, LogOut } from 'lucide-react';
import { useSync } from '@/app/providers/SyncProvider';
import { useTheme } from '@/app/providers/ThemeProvider';
import { useAuth } from '@/app/providers/AuthProvider';
import { Button } from 'glisse';

interface TopHeaderProps {
  title: string;
  subtitle?: string;
}

export const TopHeader: React.FC<TopHeaderProps> = ({ title, subtitle }) => {
  const { isOnline, pendingWritesCount, triggerManualRefresh, isRefreshing } = useSync();
  const { isDark, toggleTheme } = useTheme();
  const { user, signOutUser } = useAuth();

  return (
    <header 
      className="sticky top-0 z-30 w-full bg-[var(--lg-surface)] backdrop-blur-2xl border-b border-[var(--lg-surface-edge)] px-4 flex items-center justify-between select-none transition-colors duration-200"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.65rem)',
        paddingBottom: '0.65rem'
      }}
    >
      <div>
        <h1 className="text-base font-extrabold text-[var(--lg-foreground)] tracking-tight">{title}</h1>
        {subtitle && <p className="text-xs text-[var(--lg-muted)] font-medium">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-2">
        {/* Network & Sync Status Pill */}
        {!isOnline ? (
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
            <WifiOff className="w-3 h-3" />
            <span>Offline</span>
          </div>
        ) : pendingWritesCount > 0 ? (
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <Cloud className="w-3 h-3 animate-pulse" />
            <span>Syncing ({pendingWritesCount})</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            <span>Synced</span>
          </div>
        )}

        {/* Glisse Apple Liquid Glass Theme Switcher */}
        <Button
          variant="glass"
          aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
          onClick={toggleTheme}
          icon={isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-blue-600" />}
          className="!p-2 !rounded-full !w-9 !h-9"
        />

        {/* Glisse Apple Liquid Glass Refresh Button */}
        <Button
          variant="glass"
          aria-label="Refresh financial records"
          onClick={() => triggerManualRefresh()}
          disabled={isRefreshing}
          icon={isRefreshing ? <RotateCw className="w-4 h-4 animate-spin text-blue-600 dark:text-blue-400" /> : <RefreshCw className="w-4 h-4" />}
          className="!p-2 !rounded-full !w-9 !h-9"
        />

        {/* User Sign-out if authenticated */}
        {user && (
          <Button
            variant="glass"
            aria-label="Sign out"
            onClick={() => signOutUser()}
            icon={<LogOut className="w-4 h-4 text-rose-500" />}
            className="!p-2 !rounded-full !w-9 !h-9"
          />
        )}
      </div>
    </header>
  );
};
