import React from 'react';
import { Account, AccountType } from '@/domain/entities';
import { Money } from '@/domain/accounting/money';
import { Button } from 'glisse';
import { Banknote, Landmark, Smartphone, Wallet, X } from 'lucide-react';
import { ModalPortal } from '@/components/common/ModalPortal';

function getAccountTypeBadge(type: AccountType): string {
  switch (type) {
    case 'cash':
      return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
    case 'bank':
      return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';
    case 'mobile_wallet':
      return 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20';
    default:
      return 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20';
  }
}

function getAccountTypeLabel(type: AccountType): string {
  switch (type) {
    case 'cash':
      return 'Cash';
    case 'bank':
      return 'Bank Account';
    case 'mobile_wallet':
      return 'Mobile Wallet';
    default:
      return 'Other';
  }
}

function renderAccountIcon(type: AccountType) {
  switch (type) {
    case 'cash':
      return <Banknote className="w-6 h-6 text-emerald-500" />;
    case 'bank':
      return <Landmark className="w-6 h-6 text-blue-500" />;
    case 'mobile_wallet':
      return <Smartphone className="w-6 h-6 text-violet-500" />;
    default:
      return <Wallet className="w-6 h-6 text-slate-500" />;
  }
}

interface AccountDetailModalProps {
  account: Account | null;
  onClose: () => void;
}

export const AccountDetailModal: React.FC<AccountDetailModalProps> = ({ account, onClose }) => {
  if (!account) return null;

  const netChangeMinor = account.currentBalanceMinor - account.openingBalanceMinor;

  return (
    <ModalPortal isOpen={Boolean(account)}>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/20 dark:bg-black/60 backdrop-blur-sm animate-fade-in overflow-y-auto overscroll-none"
        onClick={onClose}
      >
        <div
          className="w-full max-w-md p-4 sm:p-6 rounded-3xl space-y-4 sm:space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto box-border bg-[var(--lg-surface)] border border-[var(--lg-surface-edge)] backdrop-blur-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between pb-3 border-b border-[var(--lg-separator)]">
            <div className="min-w-0">
              <span
                className={`text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${getAccountTypeBadge(account.type)}`}
              >
                {getAccountTypeLabel(account.type)}
              </span>
              <h3 className="text-lg font-black text-[var(--lg-foreground)] mt-1.5 truncate">
                {account.name}
              </h3>
              {account.institution && (
                <p className="text-xs text-[var(--lg-muted)] truncate">{account.institution}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-full text-[var(--lg-muted)] hover:text-[var(--lg-foreground)] flex-shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-3 text-xs">
            <div className="p-3.5 rounded-2xl bg-[var(--lg-muted)]/10 flex items-center justify-between gap-3">
              <div>
                <span className="text-[10px] text-[var(--lg-muted)] uppercase tracking-wider font-semibold block">
                  Current Balance
                </span>
                <span className="text-base font-extrabold text-[var(--lg-foreground)] tabular-nums">
                  {Money.format(account.currentBalanceMinor)}
                </span>
              </div>
              {renderAccountIcon(account.type)}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-[var(--lg-muted)]/5">
                <span className="text-[10px] text-[var(--lg-muted)] uppercase tracking-wider font-semibold block">
                  Opening Balance
                </span>
                <span className="font-semibold text-[var(--lg-foreground)] tabular-nums mt-0.5 block">
                  {Money.format(account.openingBalanceMinor)}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-[var(--lg-muted)]/5">
                <span className="text-[10px] text-[var(--lg-muted)] uppercase tracking-wider font-semibold block">
                  Net Change
                </span>
                <span
                  className={`font-semibold tabular-nums mt-0.5 block ${
                    netChangeMinor >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {netChangeMinor > 0 ? '+' : ''}
                  {Money.format(netChangeMinor)}
                </span>
              </div>
            </div>

            {account.accountNumber && (
              <div className="p-3 rounded-xl bg-[var(--lg-muted)]/5 flex items-center justify-between gap-2">
                <span className="text-[11px] text-[var(--lg-muted)]">Account Number</span>
                <span className="text-xs font-mono font-semibold text-[var(--lg-foreground)]">
                  {account.accountNumber}
                </span>
              </div>
            )}
          </div>

          <div className="flex justify-end pt-2 border-t border-[var(--lg-separator)]">
            <Button
              variant="glass"
              onClick={onClose}
              className="!text-xs font-semibold"
            >
              Close
            </Button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};
