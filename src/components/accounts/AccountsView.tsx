import React, { useState, useEffect } from 'react';
import { Account, AccountType } from '@/domain/entities';
import { FirestoreAccountRepository, FirestoreTransactionRepository } from '@/data/repositories/firestore';
import { useAuth } from '@/app/providers/AuthProvider';
import { Money } from '@/domain/accounting/money';
import { DomainUseCases } from '@/domain/usecases';
import { Glass, Button, Input } from 'glisse';
import { 
  Wallet, 
  Plus, 
  ArrowRightLeft, 
  Building, 
  Smartphone, 
  Banknote, 
  X, 
  AlertCircle
} from 'lucide-react';
import { ModalPortal } from '@/components/common/ModalPortal';

const accountRepo = new FirestoreAccountRepository();
const transactionRepo = new FirestoreTransactionRepository();

// In-memory cache for instant (0ms) account switching
let cachedAccounts: { userId: string; data: Account[] } | null = null;

export const AccountsView: React.FC = () => {
  const { user } = useAuth();
  const userId = user?.uid || 'guest-user';

  const [accounts, setAccounts] = useState<Account[]>(() => {
    return cachedAccounts && cachedAccounts.userId === userId ? cachedAccounts.data : [];
  });
  const [loading, setLoading] = useState<boolean>(() => {
    return !(cachedAccounts && cachedAccounts.userId === userId);
  });
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [isTransferOpen, setIsTransferOpen] = useState<boolean>(false);

  // New account form state
  const [name, setName] = useState<string>('');
  const [type, setType] = useState<AccountType>('bank');
  const [institution, setInstitution] = useState<string>('');
  const [accountNumber, setAccountNumber] = useState<string>('');
  const [openingBalanceStr, setOpeningBalanceStr] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Transfer form state
  const [sourceAccountId, setSourceAccountId] = useState<string>('');
  const [targetAccountId, setTargetAccountId] = useState<string>('');
  const [transferAmountStr, setTransferAmountStr] = useState<string>('');
  const [transferNotes, setTransferNotes] = useState<string>('');
  const [transferDate, setTransferDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferring, setTransferring] = useState<boolean>(false);

  // Real-time cache-first synchronization: instant (< 10ms) from local cache
  useEffect(() => {
    let unsub: (() => void) | undefined;

    if (accountRepo.subscribe) {
      unsub = accountRepo.subscribe(
        userId,
        (data) => {
          setAccounts(data);
          cachedAccounts = { userId, data };
          setLoading(false);
        },
        (err) => {
          console.warn('[Accounts] Subscribe fallback:', err);
          setLoading(false);
        }
      );
    } else {
      accountRepo.list(userId).then((data) => {
        setAccounts(data);
        cachedAccounts = { userId, data };
        setLoading(false);
      });
    }

    return () => {
      if (unsub) unsub();
    };
  }, [userId]);

  const totalLiquidityMinor = accounts.reduce((acc, a) => acc + a.currentBalanceMinor, 0);

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError('Account name is required.');
      return;
    }

    const openingParsed = parseFloat(openingBalanceStr) || 0;
    const balanceMinor = Math.round(openingParsed * 100);

    setSubmitting(true);
    setFormError(null);

    try {
      const newAccount: Account = {
        id: `acc-${Date.now()}`,
        name: name.trim(),
        type,
        institution: institution.trim() || undefined,
        accountNumber: accountNumber.trim() || undefined,
        openingBalanceMinor: balanceMinor,
        currentBalanceMinor: balanceMinor,
        isArchived: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await accountRepo.create(userId, newAccount);
      setAccounts((prev) => [...prev, newAccount]);
      setIsCreateOpen(false);
      resetAccountForm();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to create account');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExecuteTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceAccountId || !targetAccountId) {
      setTransferError('Please select both source and destination accounts.');
      return;
    }

    if (sourceAccountId === targetAccountId) {
      setTransferError('Source and target accounts must be different.');
      return;
    }

    const amountParsed = parseFloat(transferAmountStr) || 0;
    if (amountParsed <= 0) {
      setTransferError('Transfer amount must be greater than zero.');
      return;
    }

    const amountMinor = Math.round(amountParsed * 100);
    const sourceAcc = accounts.find((a) => a.id === sourceAccountId);
    const targetAcc = accounts.find((a) => a.id === targetAccountId);

    if (!sourceAcc || !targetAcc) {
      setTransferError('Invalid accounts selected.');
      return;
    }

    setTransferring(true);
    setTransferError(null);

    try {
      // 1. Create domain transfer transaction
      const transferTx = DomainUseCases.createTransfer({
        sourceAccountId,
        targetAccountId,
        amountMinor,
        date: transferDate || new Date().toISOString().slice(0, 10),
        notes: transferNotes.trim() || undefined,
      });

      // 2. Persist transaction
      await transactionRepo.create(userId, transferTx);

      // 3. Atomically update balances
      const newSourceBalance = sourceAcc.currentBalanceMinor - amountMinor;
      const newTargetBalance = targetAcc.currentBalanceMinor + amountMinor;

      await accountRepo.updateBalance(userId, sourceAccountId, newSourceBalance);
      await accountRepo.updateBalance(userId, targetAccountId, newTargetBalance);

      // 4. Update local state
      setAccounts((prev) =>
        prev.map((a) => {
          if (a.id === sourceAccountId) return { ...a, currentBalanceMinor: newSourceBalance };
          if (a.id === targetAccountId) return { ...a, currentBalanceMinor: newTargetBalance };
          return a;
        })
      );

      setIsTransferOpen(false);
      resetTransferForm();
    } catch (err: unknown) {
      setTransferError(err instanceof Error ? err.message : 'Transfer failed');
    } finally {
      setTransferring(false);
    }
  };

  const resetAccountForm = () => {
    setName('');
    setType('bank');
    setInstitution('');
    setAccountNumber('');
    setOpeningBalanceStr('');
    setFormError(null);
  };

  const resetTransferForm = () => {
    setSourceAccountId('');
    setTargetAccountId('');
    setTransferAmountStr('');
    setTransferNotes('');
    setTransferDate(new Date().toISOString().slice(0, 10));
    setTransferError(null);
  };

  const getAccountIcon = (accType: AccountType) => {
    switch (accType) {
      case 'bank':
        return <Building className="w-5 h-5 text-blue-500" />;
      case 'mobile_wallet':
        return <Smartphone className="w-5 h-5 text-purple-500" />;
      case 'cash':
        return <Banknote className="w-5 h-5 text-emerald-500" />;
      default:
        return <Wallet className="w-5 h-5 text-slate-500" />;
    }
  };

  return (
    <div className="space-y-4 pb-20">
      {/* Liquidity Total Card */}
      <Glass className="p-5 rounded-2xl space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-[10px] font-bold tracking-wider text-[var(--lg-muted)] uppercase block">
              Total Liquid Funds
            </span>
            <span className="text-2xl sm:text-3xl font-black text-[var(--lg-foreground)] tabular-nums mt-1 block">
              {Money.format(totalLiquidityMinor)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="glass"
              icon={<ArrowRightLeft className="w-3.5 h-3.5" />}
              onClick={() => setIsTransferOpen(true)}
              disabled={accounts.length < 2}
              className="!text-xs font-semibold !py-1.5 !px-3"
            >
              Transfer
            </Button>
            <Button
              variant="filled"
              tint="#2563EB"
              icon={<Plus className="w-3.5 h-3.5 stroke-[2.5]" />}
              onClick={() => setIsCreateOpen(true)}
              className="!text-xs font-semibold !py-1.5 !px-3"
            >
              Add
            </Button>
          </div>
        </div>

        <p className="text-[11px] text-[var(--lg-muted)]">
          Consolidated liquidity across {accounts.length} active wallets, cash drawers, and bank accounts.
        </p>
      </Glass>

      {/* Account Cards Grid */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <Glass key={i} className="p-5 rounded-2xl animate-pulse space-y-3">
              <div className="h-4 bg-[var(--lg-muted)]/20 rounded w-1/3"></div>
              <div className="h-3 bg-[var(--lg-muted)]/20 rounded w-1/2"></div>
            </Glass>
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <Glass className="p-8 text-center space-y-3 rounded-2xl">
          <Wallet className="w-12 h-12 text-[var(--lg-muted)] mx-auto opacity-60" />
          <div>
            <p className="text-sm font-bold text-[var(--lg-foreground)]">No accounts configured</p>
            <p className="text-xs text-[var(--lg-muted)] max-w-xs mx-auto mt-1 leading-relaxed">
              Add your cash in hand, bank accounts, or mobile wallets (EasyPaisa/JazzCash) to start recording cash flow.
            </p>
          </div>
          <div className="pt-2">
            <Button
              variant="filled"
              tint="#2563EB"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => setIsCreateOpen(true)}
              className="!text-xs font-semibold"
            >
              Create Account
            </Button>
          </div>
        </Glass>
      ) : (
        <div className="space-y-3">
          {accounts.map((acc) => (
            <Glass key={acc.id} className="p-4 sm:p-5 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-[var(--lg-muted)]/10 flex-shrink-0">
                    {getAccountIcon(acc.type)}
                  </div>
                  <div>
                    <h3 className="font-extrabold text-[var(--lg-foreground)] text-sm sm:text-base">
                      {acc.name}
                    </h3>
                    <p className="text-[11px] text-[var(--lg-muted)] capitalize">
                      {acc.institution || acc.type.replace('_', ' ')}
                      {acc.accountNumber && ` •••• ${acc.accountNumber.slice(-4)}`}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-base sm:text-lg font-black text-[var(--lg-foreground)] tabular-nums block">
                    {Money.format(acc.currentBalanceMinor)}
                  </span>
                  <span className="text-[10px] text-[var(--lg-muted)] uppercase tracking-wider">
                    Available
                  </span>
                </div>
              </div>
            </Glass>
          ))}
        </div>
      )}

      {/* Create Account Modal */}
      {isCreateOpen && (
        <ModalPortal isOpen={isCreateOpen}>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/20 dark:bg-black/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
            <div className="w-full max-w-md p-4 sm:p-6 rounded-3xl space-y-4 sm:space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto box-border bg-[var(--lg-surface)] border border-[var(--lg-surface-edge)] backdrop-blur-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--lg-separator)]">
              <div>
                <h3 className="text-base font-extrabold text-[var(--lg-foreground)]">Add New Account</h3>
                <p className="text-[11px] text-[var(--lg-muted)]">Cash drawer, bank, or mobile wallet</p>
              </div>
              <button
                onClick={() => {
                  setIsCreateOpen(false);
                  resetAccountForm();
                }}
                className="p-1 rounded-full text-[var(--lg-muted)] hover:text-[var(--lg-foreground)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreateAccount} className="space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-[var(--lg-muted)] uppercase tracking-wider mb-1.5">
                  Account Name *
                </label>
                <Input
                  placeholder="e.g. Meezan Main Checking"
                  value={name}
                  onValueChange={setName}
                  className="!max-w-none"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--lg-muted)] uppercase tracking-wider mb-2">
                  Account Type
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['bank', 'cash', 'mobile_wallet'] as AccountType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setType(t)}
                      className={`py-2 px-2.5 rounded-xl text-xs font-semibold capitalize border transition-all ${
                        type === t
                          ? 'border-blue-600 bg-blue-600/10 text-blue-600 dark:text-blue-400'
                          : 'border-[var(--lg-surface-edge)] bg-[var(--lg-muted)]/5 text-[var(--lg-muted)]'
                      }`}
                    >
                      {t.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--lg-muted)] uppercase tracking-wider mb-1.5">
                    Institution / Bank
                  </label>
                  <Input
                    placeholder="e.g. Meezan Bank"
                    value={institution}
                    onValueChange={setInstitution}
                    className="!max-w-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--lg-muted)] uppercase tracking-wider mb-1.5">
                    Account # / IBAN
                  </label>
                  <Input
                    placeholder="e.g. 0123456789"
                    value={accountNumber}
                    onValueChange={setAccountNumber}
                    className="!max-w-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--lg-muted)] uppercase tracking-wider mb-1.5">
                  Opening Balance (Rs)
                </label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={openingBalanceStr}
                  onValueChange={setOpeningBalanceStr}
                  className="!max-w-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[var(--lg-separator)]">
                <Button
                  variant="glass"
                  type="button"
                  onClick={() => {
                    setIsCreateOpen(false);
                    resetAccountForm();
                  }}
                  className="!text-xs font-semibold"
                >
                  Cancel
                </Button>
                <Button
                  variant="filled"
                  tint="#2563EB"
                  type="submit"
                  disabled={submitting}
                  className="!text-xs font-semibold"
                >
                  {submitting ? 'Saving...' : 'Add Account'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </ModalPortal>
    )}

      {/* Inter-Account Transfer Modal */}
      {isTransferOpen && (
        <ModalPortal isOpen={isTransferOpen}>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/20 dark:bg-black/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
            <div className="w-full max-w-md p-4 sm:p-6 rounded-3xl space-y-4 sm:space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto box-border bg-[var(--lg-surface)] border border-[var(--lg-surface-edge)] backdrop-blur-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--lg-separator)]">
              <div>
                <h3 className="text-base font-extrabold text-[var(--lg-foreground)]">Inter-Account Transfer</h3>
                <p className="text-[11px] text-[var(--lg-muted)]">P&L-neutral movement between accounts</p>
              </div>
              <button
                onClick={() => {
                  setIsTransferOpen(false);
                  resetTransferForm();
                }}
                className="p-1 rounded-full text-[var(--lg-muted)] hover:text-[var(--lg-foreground)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {transferError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{transferError}</span>
              </div>
            )}

            <form onSubmit={handleExecuteTransfer} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--lg-muted)] uppercase tracking-wider mb-1.5 min-h-[1.75rem] flex items-end">
                    From Account *
                  </label>
                  <select
                    value={sourceAccountId}
                    onChange={(e) => setSourceAccountId(e.target.value)}
                    className="w-full h-10 px-3 rounded-2xl theme-select text-xs font-medium focus:outline-none cursor-pointer"
                    required
                  >
                    <option value="">Select source</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({Money.format(a.currentBalanceMinor)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[var(--lg-muted)] uppercase tracking-wider mb-1.5 min-h-[1.75rem] flex items-end">
                    To Account *
                  </label>
                  <select
                    value={targetAccountId}
                    onChange={(e) => setTargetAccountId(e.target.value)}
                    className="w-full h-10 px-3 rounded-2xl theme-select text-xs font-medium focus:outline-none cursor-pointer"
                    required
                  >
                    <option value="">Select destination</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({Money.format(a.currentBalanceMinor)})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--lg-muted)] uppercase tracking-wider mb-1.5 min-h-[1.75rem] flex items-end">
                    Transfer Amount (Rs) *
                  </label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={transferAmountStr}
                    onValueChange={setTransferAmountStr}
                    className="!max-w-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--lg-muted)] uppercase tracking-wider mb-1.5 min-h-[1.75rem] flex items-end">
                    Transfer Date
                  </label>
                  <Input
                    type="date"
                    value={transferDate}
                    onValueChange={setTransferDate}
                    className="!max-w-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--lg-muted)] uppercase tracking-wider mb-1.5">
                  Memo / Reference Notes
                </label>
                <Input
                  placeholder="e.g. ATM cash withdrawal for site petty cash"
                  value={transferNotes}
                  onValueChange={setTransferNotes}
                  className="!max-w-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[var(--lg-separator)]">
                <Button
                  variant="glass"
                  type="button"
                  onClick={() => {
                    setIsTransferOpen(false);
                    resetTransferForm();
                  }}
                  className="!text-xs font-semibold"
                >
                  Cancel
                </Button>
                <Button
                  variant="filled"
                  tint="#2563EB"
                  type="submit"
                  disabled={transferring}
                  className="!text-xs font-semibold"
                >
                  {transferring ? 'Executing...' : 'Complete Transfer'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </ModalPortal>
    )}
    </div>
  );
};
