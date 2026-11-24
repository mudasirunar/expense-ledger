import React, { useState } from 'react';
import { ChevronLeft, LogOut, Trash2 } from 'lucide-react';
import { useAuth } from '@/app/providers/AuthProvider';
import { useTheme } from '@/app/providers/ThemeProvider';
import { useSnackbar } from '@/app/providers/SnackbarProvider';
import { Glass, Button, Input } from 'glisse';
import { ThemePreviewPicker } from './ThemePreviewPicker';
import { AppDialog } from '@/components/common/AppDialog';
import { wipeAllUserData } from '@/data/sync/dataWipeService';

interface ProfileViewProps {
  onBack: () => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({ onBack }) => {
  const { user, signOutUser } = useAuth();
  const { theme, setTheme } = useTheme();
  const { showSnackbar } = useSnackbar();
  const [isSignOutDialogOpen, setIsSignOutDialogOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeletingData, setIsDeletingData] = useState(false);

  const handleConfirmSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOutUser();
    } catch (error) {
      console.error('[Profile] Sign out failed:', error);
      setIsSigningOut(false);
    }
  };

  const handleConfirmDeleteAllData = async () => {
    if (!user?.uid || deleteConfirmText.trim().toUpperCase() !== 'DELETE') return;
    setIsDeletingData(true);
    try {
      await wipeAllUserData(user.uid);
      setIsDeleteDialogOpen(false);
      setDeleteConfirmText('');
      showSnackbar({
        message: 'Your data has been deleted.',
        tone: 'success',
      });
    } catch (error) {
      console.error('[Profile] Data wipe failed:', error);
      showSnackbar({
        message: 'Could not delete data. Please try again.',
        tone: 'error',
      });
    } finally {
      setIsDeletingData(false);
    }
  };

  const isPWA = typeof window !== 'undefined' && (
    window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((navigator as unknown as { standalone?: boolean }).standalone)
  );

  const displayName = user?.displayName || 'Authorized User';
  const email = user?.email || 'No email attached';
  const photoURL = user?.photoURL;
  const initial = (displayName[0] || 'U').toUpperCase();

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-[#E2DDD5] dark:bg-background text-slate-900 dark:text-slate-100 overflow-hidden font-sans transition-colors duration-200">
      {/* Status Bar Ceiling Spacer: Matches main layout for PWA safe area */}
      <div
        className="w-full flex-shrink-0 bg-transparent select-none pointer-events-none pwa-top-spacer"
        style={{
          height: isPWA
            ? 'calc(env(safe-area-inset-top, 0px) + 12px)'
            : 'env(safe-area-inset-top, 0px)'
        }}
      />

      {/* Dedicated Minimal Profile Top Bar */}
      <header className="z-30 w-full bg-[#E2DDD5] dark:bg-background border-none px-4 py-2.5 flex items-center gap-3 select-none transition-colors duration-200">
        <Button
          variant="glass"
          aria-label="Go back"
          onClick={onBack}
          icon={<ChevronLeft className="w-4 h-4" />}
          className="!p-2 !rounded-full !w-9 !h-9 flex-shrink-0"
        />
        <h1 className="text-xl font-extrabold text-[var(--lg-foreground)] tracking-tight">
          Profile
        </h1>
      </header>

      {/* Standalone Scrollable Flat Body */}
      <div className="flex-1 overflow-y-auto overscroll-y-contain">
        <main className="max-w-md sm:max-w-lg mx-auto w-full px-4 pt-4 pb-10 space-y-6">
          {/* Profile Identity (Flat on screen, no card) */}
          <section className="flex items-center gap-4">
            <div className="flex-shrink-0">
              {photoURL ? (
                <img
                  src={photoURL}
                  alt={displayName}
                  referrerPolicy="no-referrer"
                  className="w-16 h-16 rounded-full object-cover shadow-md border border-white/50 dark:border-white/15"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-black text-2xl flex items-center justify-center shadow-md">
                  {initial}
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-extrabold text-[var(--lg-foreground)] truncate">
                {displayName}
              </h2>
              <p className="text-sm text-[var(--lg-muted)] font-medium truncate mt-0.5">
                {email}
              </p>
            </div>
          </section>

          {/* Appearance Section */}
          <section className="space-y-2.5">
            <h3 className="text-xs font-bold tracking-wider text-[var(--lg-muted)] uppercase px-0.5">
              Appearance
            </h3>

            <Glass className="p-4 sm:p-5 rounded-2xl w-full">
              <ThemePreviewPicker value={theme} onChange={setTheme} />
            </Glass>
          </section>

          {/* Data Section */}
          <section className="space-y-2.5">
            <h3 className="text-xs font-bold tracking-wider text-[var(--lg-muted)] uppercase px-0.5">
              Data
            </h3>

            <Button
              variant="glass"
              onClick={() => {
                setDeleteConfirmText('');
                setIsDeleteDialogOpen(true);
              }}
              className="!w-full !py-3 !rounded-[24px] font-bold !text-[var(--lg-foreground)] flex items-center justify-center gap-2 transition-all"
              icon={<Trash2 className="w-4 h-4 text-[var(--lg-muted)]" />}
            >
              Delete All Data
            </Button>
          </section>

          {/* Account Section */}
          <section className="space-y-2.5">
            <h3 className="text-xs font-bold tracking-wider text-[var(--lg-muted)] uppercase px-0.5">
              Account
            </h3>

            <Button
              variant="glass"
              onClick={() => setIsSignOutDialogOpen(true)}
              className="!w-full !py-3 !rounded-[24px] font-bold !text-red-600 dark:!text-red-400 !bg-red-500/15 hover:!bg-red-500/25 !border-red-500/25 flex items-center justify-center gap-2 transition-all"
              icon={<LogOut className="w-4 h-4 text-red-600 dark:text-red-400" />}
            >
              Sign Out
            </Button>

            {/* Auto-detected App Version */}
            <p className="pt-1 text-center text-[11px] font-medium text-[var(--lg-muted)] opacity-50 tracking-wide">
              Expense Ledger v{__APP_VERSION__}
            </p>
          </section>
        </main>
      </div>

      {/* Reusable Glisse Confirmation Dialog for Sign Out */}
      <AppDialog
        isOpen={isSignOutDialogOpen}
        onClose={() => setIsSignOutDialogOpen(false)}
        title="Sign Out"
        titleAlign="left"
        description="Are you sure you want to sign out?"
        descriptionAlign="left"
        tone="danger"
        confirmLabel="Sign Out"
        confirmLoadingLabel="Signing out..."
        cancelLabel="Cancel"
        onConfirm={handleConfirmSignOut}
        isLoading={isSigningOut}
        disableCancelWhileLoading={true}
      />

      {/* Reusable Glisse Confirmation Dialog for Delete All Data */}
      <AppDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => {
          setIsDeleteDialogOpen(false);
          setDeleteConfirmText('');
        }}
        title="Delete All Data"
        titleAlign="center"
        description={
          <>
            This permanently erases all projects, accounts, contacts, and transactions from this device and cloud.
            <span className="block mt-1.5">
              Type DELETE to confirm.
            </span>
          </>
        }
        descriptionAlign="left"
        tone="danger"
        confirmLabel="Delete"
        confirmLoadingLabel="Deleting..."
        cancelLabel="Cancel"
        onConfirm={handleConfirmDeleteAllData}
        isLoading={isDeletingData}
        disableConfirm={deleteConfirmText.trim().toUpperCase() !== 'DELETE'}
        disableCancelWhileLoading={true}
      >
        <Input
          placeholder="Type DELETE"
          value={deleteConfirmText}
          onValueChange={setDeleteConfirmText}
          disabled={isDeletingData}
          className="!max-w-none"
        />
      </AppDialog>
    </div>
  );
};
