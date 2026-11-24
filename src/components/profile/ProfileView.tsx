import React, { useRef, useState } from 'react';
import {
  ChevronLeft,
  LogOut,
  Trash2,
  Download,
  Upload,
  FileSpreadsheet,
  Loader2,
} from 'lucide-react';
import { useAuth } from '@/app/providers/AuthProvider';
import { useTheme } from '@/app/providers/ThemeProvider';
import { useSnackbar } from '@/app/providers/SnackbarProvider';
import { useSync } from '@/app/providers/SyncProvider';
import { Glass, Button, Input } from 'glisse';
import { ThemePreviewPicker } from './ThemePreviewPicker';
import { AppDialog } from '@/components/common/AppDialog';
import { wipeAllUserData } from '@/data/sync/dataWipeService';
import {
  SmartRestorePlan,
  UserCollectionName,
  executeSmartRestore,
  exportFullBackupJson,
  exportLedgerCsv,
  parseAndValidateBackup,
  planSmartRestore,
} from '@/data/sync/backupRestoreService';

const COLLECTION_LABELS: Record<UserCollectionName, string> = {
  projects: 'Projects',
  accounts: 'Accounts',
  contacts: 'Contacts',
  transactions: 'Transactions',
  obligations: 'Obligations',
  payments: 'Payments',
  allocations: 'Allocations',
};

interface ProfileViewProps {
  onBack: () => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({ onBack }) => {
  const { user, signOutUser } = useAuth();
  const { theme, setTheme } = useTheme();
  const { showSnackbar } = useSnackbar();
  const { isOnline, pendingWritesCount } = useSync();
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const [isSignOutDialogOpen, setIsSignOutDialogOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeletingData, setIsDeletingData] = useState(false);

  const [isExportingJson, setIsExportingJson] = useState(false);
  const [isExportingCsv, setIsExportingCsv] = useState(false);

  const [isAnalyzingRestore, setIsAnalyzingRestore] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<{
    plan: SmartRestorePlan;
    filename: string;
  } | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

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
      // Clears local immediately and runs Firestore cloud wipe silently in the background
      await wipeAllUserData(user.uid, { runInBackground: true });
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

  const handleBackupJson = async () => {
    if (!user?.uid || isExportingJson) return;
    setIsExportingJson(true);
    try {
      const { totalRecords } = await exportFullBackupJson(user.uid);
      showSnackbar({
        message: totalRecords > 0 ? `Backup downloaded (${totalRecords} records).` : 'Empty backup downloaded.',
        tone: 'success',
      });
    } catch (error) {
      console.error('[Profile] Backup export failed:', error);
      showSnackbar({
        message: 'Could not create backup. Please try again.',
        tone: 'error',
      });
    } finally {
      setIsExportingJson(false);
    }
  };

  const handleExportCsv = async () => {
    if (!user?.uid || isExportingCsv) return;
    setIsExportingCsv(true);
    try {
      const { rowCount } = await exportLedgerCsv(user.uid);
      showSnackbar({
        message: rowCount > 0 ? `Exported ${rowCount} transactions to CSV.` : 'Exported empty CSV.',
        tone: 'success',
      });
    } catch (error) {
      console.error('[Profile] CSV export failed:', error);
      showSnackbar({
        message: 'Could not export CSV. Please try again.',
        tone: 'error',
      });
    } finally {
      setIsExportingCsv(false);
    }
  };

  const handleRestoreFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user?.uid) return;

    setIsAnalyzingRestore(true);
    try {
      const text = await file.text();
      const validation = parseAndValidateBackup(text);
      if (!validation.valid || !validation.envelope) {
        showSnackbar({
          message: validation.error || 'Invalid backup file.',
          tone: 'error',
        });
        return;
      }

      const plan = await planSmartRestore(user.uid, validation.envelope);
      setPendingRestore({
        plan,
        filename: file.name,
      });
    } catch (error) {
      console.error('[Profile] Restore analysis failed:', error);
      showSnackbar({
        message: 'Could not read backup file.',
        tone: 'error',
      });
    } finally {
      setIsAnalyzingRestore(false);
    }
  };

  const handleConfirmRestore = async () => {
    if (!user?.uid || !pendingRestore) return;
    setIsRestoring(true);
    try {
      const { importedCount, updatedCount, skippedCount } = await executeSmartRestore(
        user.uid,
        pendingRestore.plan
      );
      setPendingRestore(null);

      const parts: string[] = [];
      if (importedCount > 0) parts.push(`${importedCount} imported`);
      if (updatedCount > 0) parts.push(`${updatedCount} updated`);
      if (skippedCount > 0) parts.push(`${skippedCount} skipped`);

      showSnackbar({
        message: parts.length > 0 ? `Restore complete: ${parts.join(', ')}.` : 'Nothing new to restore.',
        tone: 'success',
      });
    } catch (error) {
      console.error('[Profile] Restore failed:', error);
      showSnackbar({
        message: 'Could not restore backup. Please try again.',
        tone: 'error',
      });
    } finally {
      setIsRestoring(false);
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
    <div className="flex flex-col app-screen w-full bg-[#E2DDD5] dark:bg-background text-slate-900 dark:text-slate-100 overflow-hidden font-sans transition-colors duration-200">
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
      <div className="flex-1 overflow-y-auto scroll-container overscroll-y-contain">
        <main className="max-w-md sm:max-w-lg mx-auto w-full px-4 pt-4 pb-10 space-y-6">
          {/* Profile Identity (Flat on screen, no card) */}
          <section className="flex items-center gap-4">
            <div
              className={`flex-shrink-0 w-16 h-16 rounded-full overflow-hidden transition-all ${statusRingClass}`}
              title={statusLabel}
            >
              {photoURL ? (
                <img
                  src={photoURL}
                  alt={displayName}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-black text-2xl flex items-center justify-center">
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

            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleRestoreFileChange}
              className="hidden"
            />

            <Button
              variant="glass"
              onClick={handleBackupJson}
              disabled={isExportingJson}
              className="!w-full !py-3 !rounded-[24px] font-bold !text-[var(--lg-foreground)] flex items-center justify-center gap-2 transition-all"
              icon={
                isExportingJson ? (
                  <Loader2 className="w-4 h-4 animate-spin text-[var(--lg-muted)]" />
                ) : (
                  <Download className="w-4 h-4 text-[var(--lg-muted)]" />
                )
              }
            >
              {isExportingJson ? 'Preparing Backup...' : 'Backup Data'}
            </Button>

            <Button
              variant="glass"
              onClick={() => fileInputRef.current?.click()}
              disabled={isAnalyzingRestore}
              className="!w-full !py-3 !rounded-[24px] font-bold !text-[var(--lg-foreground)] flex items-center justify-center gap-2 transition-all"
              icon={
                isAnalyzingRestore ? (
                  <Loader2 className="w-4 h-4 animate-spin text-[var(--lg-muted)]" />
                ) : (
                  <Upload className="w-4 h-4 text-[var(--lg-muted)]" />
                )
              }
            >
              {isAnalyzingRestore ? 'Checking Backup...' : 'Restore Backup'}
            </Button>

            <Button
              variant="glass"
              onClick={handleExportCsv}
              disabled={isExportingCsv}
              className="!w-full !py-3 !rounded-[24px] font-bold !text-[var(--lg-foreground)] flex items-center justify-center gap-2 transition-all"
              icon={
                isExportingCsv ? (
                  <Loader2 className="w-4 h-4 animate-spin text-[var(--lg-muted)]" />
                ) : (
                  <FileSpreadsheet className="w-4 h-4 text-[var(--lg-muted)]" />
                )
              }
            >
              {isExportingCsv ? 'Exporting...' : 'Export Transactions'}
            </Button>

            <Button
              variant="glass"
              onClick={() => {
                setDeleteConfirmText('');
                setIsDeleteDialogOpen(true);
              }}
              className="!w-full !py-3 !rounded-[24px] font-bold !text-red-600 dark:!text-red-400 !bg-red-500/15 hover:!bg-red-500/25 !border-red-500/25 flex items-center justify-center gap-2 transition-all"
              icon={<Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />}
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

      {/* Reusable Glisse Confirmation Dialog for Smart Merge Restore Preview */}
      <AppDialog
        isOpen={Boolean(pendingRestore)}
        onClose={() => setPendingRestore(null)}
        title="Restore Backup"
        titleAlign="center"
        description={
          pendingRestore ? (
            pendingRestore.plan.totalInBackup === 0 ? (
              <>
                <span className="font-semibold">{pendingRestore.filename}</span> is empty. There is nothing to import.
              </>
            ) : pendingRestore.plan.operations.length === 0 ? (
              <>
                All <span className="font-semibold">{pendingRestore.plan.totalInBackup}</span> items in{' '}
                <span className="font-semibold">{pendingRestore.filename}</span> already exist or are up to date. Nothing new to import.
              </>
            ) : (
              <>
                Existing data is kept safely.{' '}
                <span className="font-semibold">{pendingRestore.plan.toImportCount} new</span>
                {pendingRestore.plan.toUpdateCount > 0 && (
                  <>
                    {' '}and <span className="font-semibold">{pendingRestore.plan.toUpdateCount} newer</span>
                  </>
                )}{' '}
                will be imported;{' '}
                <span className="font-semibold">{pendingRestore.plan.skippedCount}</span> already exist and will be skipped.
              </>
            )
          ) : undefined
        }
        descriptionAlign="left"
        tone="default"
        confirmLabel={
          pendingRestore && pendingRestore.plan.operations.length > 0
            ? `Import (${pendingRestore.plan.operations.length})`
            : 'Import'
        }
        confirmLoadingLabel="Importing..."
        cancelLabel="Cancel"
        onConfirm={handleConfirmRestore}
        isLoading={isRestoring}
        disableConfirm={!pendingRestore || pendingRestore.plan.operations.length === 0}
        disableCancelWhileLoading={true}
      >
        {pendingRestore && (
          <div className="space-y-2">
            {/* High-level Merge Summary */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="px-2 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <p className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">
                  +{pendingRestore.plan.toImportCount}
                </p>
                <p className="text-[10px] font-semibold text-[var(--lg-muted)] uppercase">New</p>
              </div>
              <div className="px-2 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20">
                <p className="text-sm font-extrabold text-blue-600 dark:text-blue-400">
                  {pendingRestore.plan.toUpdateCount}
                </p>
                <p className="text-[10px] font-semibold text-[var(--lg-muted)] uppercase">Updated</p>
              </div>
              <div className="px-2 py-2 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10">
                <p className="text-sm font-extrabold text-[var(--lg-muted)]">
                  {pendingRestore.plan.skippedCount}
                </p>
                <p className="text-[10px] font-semibold text-[var(--lg-muted)] uppercase">Skipped</p>
              </div>
            </div>

            {/* Per-Collection Breakdown (only rendered when backup has items) */}
            {(() => {
              const nonEmptyCols = (Object.keys(COLLECTION_LABELS) as UserCollectionName[]).filter(
                (col) => {
                  const s = pendingRestore.plan.byCollection[col];
                  return s.toImport + s.toUpdate + s.skipped > 0;
                }
              );
              if (nonEmptyCols.length === 0) return null;

              return (
                <div className="space-y-1 text-xs px-3 py-2.5 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10">
                  {nonEmptyCols.map((col) => {
                    const s = pendingRestore.plan.byCollection[col];
                    const incoming = s.toImport + s.toUpdate;
                    return (
                      <div key={col} className="flex items-center justify-between py-0.5">
                        <span className="text-[var(--lg-muted)] font-medium">
                          {COLLECTION_LABELS[col]}
                        </span>
                        <span className="font-semibold text-[var(--lg-foreground)]">
                          {incoming > 0 ? `+${incoming}` : '0'}
                          {s.skipped > 0 && (
                            <span className="text-[var(--lg-muted)] font-normal ml-1.5">
                              ({s.skipped} skipped)
                            </span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}
      </AppDialog>

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
