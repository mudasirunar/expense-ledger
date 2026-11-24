import React from 'react';
import { User } from 'lucide-react';
import { useSync } from '@/app/providers/SyncProvider';
import { useAuth } from '@/app/providers/AuthProvider';

interface TopHeaderProps {
  title: string;
  subtitle?: string;
  onOpenProfile?: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({ title, subtitle, onOpenProfile }) => {
  const { isOnline, pendingWritesCount } = useSync();
  const { user } = useAuth();

  const statusRingClass = !isOnline
    ? 'ring-2 ring-red-500 ring-offset-2 ring-offset-[#E2DDD5] dark:ring-offset-background shadow-[0_0_12px_rgba(239,68,68,0.55)] dark:shadow-[0_0_14px_rgba(239,68,68,0.7)]'
    : pendingWritesCount > 0
      ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-[#E2DDD5] dark:ring-offset-background shadow-[0_0_12px_rgba(251,191,36,0.6)] dark:shadow-[0_0_14px_rgba(251,191,36,0.75)] animate-pulse'
      : 'ring-2 ring-emerald-500 ring-offset-2 ring-offset-[#E2DDD5] dark:ring-offset-background shadow-[0_0_12px_rgba(16,185,129,0.5)] dark:shadow-[0_0_14px_rgba(16,185,129,0.65)]';

  const statusLabel = !isOnline
    ? 'Offline'
    : pendingWritesCount > 0
      ? `Syncing (${pendingWritesCount})`
      : 'Synced';

  return (
    <header className="z-30 w-full bg-[#E2DDD5] dark:bg-background border-none px-4 py-2.5 flex items-center justify-between select-none transition-colors duration-200">
      <div>
        <h1 className="text-xl font-extrabold text-[var(--lg-foreground)] tracking-tight">{title}</h1>
        {subtitle && <p className="text-xs text-[var(--lg-muted)] font-medium">{subtitle}</p>}
      </div>

      {/* Profile Avatar with Colored Sync Status Ring */}
      <button
        onClick={onOpenProfile}
        aria-label={`Open profile (${statusLabel})`}
        title={statusLabel}
        className={`relative w-9 h-9 rounded-full flex items-center justify-center bg-[var(--lg-glass)] backdrop-blur-md hover:scale-105 active:scale-95 transition-all overflow-hidden ${statusRingClass}`}
      >
        {user?.photoURL ? (
          <img
            src={user.photoURL}
            alt={user.displayName || 'Profile'}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
        ) : (
          <User className="w-4 h-4 text-[var(--lg-foreground)]" />
        )}
      </button>
    </header>
  );
};
