import React, { useEffect, useState } from 'react';
import { Account, Obligation, PaymentMethod } from '@/domain/entities';
import { DomainUseCases } from '@/domain/usecases';
import { Money } from '@/domain/accounting/money';
import {
  FirestoreAccountRepository,
  FirestoreObligationRepository,
  FirestorePaymentRepository,
} from '@/data/repositories/firestore';
import { awaitLocalCommit } from '@/data/sync/dataWipeService';
import { useAuth } from '@/app/providers/AuthProvider';
import { useSnackbar } from '@/app/providers/SnackbarProvider';
import { Button, Input } from 'glisse';
import { Calendar, X } from 'lucide-react';
import { ModalPortal } from '@/components/common/ModalPortal';
import { FormErrorBanner } from '@/components/common/FormErrorBanner';

const accountRepo = new FirestoreAccountRepository();
const obligationRepo = new FirestoreObligationRepository();
const paymentRepo = new FirestorePaymentRepository();

interface PayBillModalProps {
  bill: Obligation | null;
  accounts: readonly Account[];
  contactName?: string;
  projectName?: string;
  onClose: () => void;
  onSettled?: () => void;
}

export const PayBillModal: React.FC<PayBillModalProps> = ({
  bill,
  accounts,
  contactName,
  projectName,
  onClose,
  onSettled,
}) => {
  const { user } = useAuth();
  const { showSnackbar } = useSnackbar();
  const userId = user?.uid || 'guest-user';

  const activeAccounts = accounts.filter((a) => !a.isArchived && !a.isDeleted);

  const [amountStr, setAmountStr] = useState<string>('');
  const [accountId, setAccountId] = useState<string>('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!bill) return;
    const major = Money.toMajorString(bill.remainingAmountMinor);
    setAmountStr(major.endsWith('.00') ? major.slice(0, -3) : major);
    setAccountId((prev) =>
      prev && activeAccounts.some((a) => a.id === prev)
        ? prev
        : activeAccounts[0]?.id || ''
    );
    setMethod('cash');
    setDate(new Date().toISOString().slice(0, 10));
    setNotes('');
    setError(null);
  }, [bill?.id]);

  if (!bill) return null;

  const parsedVal = parseFloat(amountStr) || 0;
  const amountMinor = parsedVal > 0 ? Money.fromMajor(parsedVal).minorUnits : 0;
  const remainingMinor = bill.remainingAmountMinor;

  const settlementHint = (() => {
    if (amountMinor <= 0) return null;
    if (amountMinor < remainingMinor) {
      return {
        text: `Partial payment — ${Money.format(remainingMinor - amountMinor)} will remain`,
        tone: 'text-amber-600 dark:text-amber-400',
      };
    }
    if (amountMinor === remainingMinor) {
      return {
        text: 'Full settlement — marks bill Paid',
        tone: 'text-emerald-600 dark:text-emerald-400',
      };
    }
    return {
      text: `Exceeds remaining balance by ${Money.format(amountMinor - remainingMinor)}`,
      tone: 'text-rose-600 dark:text-rose-400',
    };
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    if (amountMinor <= 0) {
      setError('Payment amount must be greater than zero.');
      return;
    }
    if (amountMinor > remainingMinor) {
      setError(
        `Payment cannot exceed the remaining balance of ${Money.format(remainingMinor)}.`
      );
      return;
    }
    if (!accountId) {
      setError('Please select an account to pay from.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const basePayment = DomainUseCases.recordOutgoingPayment({
        accountId,
        contactId: bill.contactId,
        projectId: bill.projectId,
        amountMinor,
        date,
        method,
        notes: notes.trim() || `Settlement for ${bill.title}`,
      });

      const { updatedObligation, updatedPayment, allocation } = DomainUseCases.allocatePayment(
        bill,
        basePayment
      );

      const acc = activeAccounts.find((a) => a.id === accountId);
      const writes: Promise<unknown>[] = [
        paymentRepo.create(userId, updatedPayment, [allocation]),
        obligationRepo.update(userId, updatedObligation.id, {
          allocatedAmountMinor: updatedObligation.allocatedAmountMinor,
          remainingAmountMinor: updatedObligation.remainingAmountMinor,
          status: updatedObligation.status,
        }),
      ];
      if (acc) {
        writes.push(
          accountRepo.updateBalance(userId, accountId, acc.currentBalanceMinor - amountMinor)
        );
      }

      await awaitLocalCommit(Promise.all(writes));

      showSnackbar({
        message:
          updatedObligation.status === 'paid'
            ? `${bill.title} marked Paid.`
            : `Paid ${Money.format(amountMinor)} toward ${bill.title}.`,
        tone: 'success',
      });
      onSettled?.();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to settle bill.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalPortal isOpen={Boolean(bill)}>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/20 dark:bg-black/60 backdrop-blur-sm animate-fade-in overflow-y-auto overflow-x-hidden overscroll-none"
        onClick={onClose}
      >
        <div
          className="w-full max-w-md p-4 sm:p-6 rounded-3xl space-y-4 sm:space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden box-border bg-[var(--lg-surface)] border border-[var(--lg-surface-edge)] backdrop-blur-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-base font-extrabold text-[var(--lg-foreground)] flex items-center gap-1.5 min-w-0">
                <span className="flex-shrink-0">Pay Bill</span>
                <span className="text-[var(--lg-muted)] font-normal flex-shrink-0">·</span>
                <span className="truncate font-bold text-[var(--lg-foreground)]/85">
                  {bill.title}
                </span>
              </h3>
              {(contactName || projectName) && (
                <p className="text-[11px] text-[var(--lg-muted)] truncate mt-0.5">
                  {[contactName, projectName].filter(Boolean).join(' · ')}
                </p>
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

          {/* Remaining balance summary pill */}
          <div className="p-3.5 rounded-2xl bg-[var(--lg-muted)]/10 flex items-center justify-between text-xs tabular-nums">
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--lg-muted)] block">
                Remaining Due
              </span>
              <span className="text-base font-black text-rose-600 dark:text-rose-400">
                {Money.format(bill.remainingAmountMinor)}
              </span>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--lg-muted)] block">
                Bill Total
              </span>
              <span className="font-bold text-[var(--lg-foreground)]">
                {Money.format(bill.totalAmountMinor)}
              </span>
            </div>
          </div>

          <div>
            <FormErrorBanner error={error} onDismiss={() => setError(null)} />

            <form onSubmit={handleSubmit} className="space-y-4">

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-[var(--lg-muted)] uppercase tracking-wider mb-1">
                  Pay Amount (Rs) *
                </label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={amountStr}
                  onValueChange={setAmountStr}
                  className="!max-w-none"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--lg-muted)] uppercase tracking-wider mb-1">
                  Date
                </label>
                <Input
                  type="date"
                  value={date}
                  onValueChange={setDate}
                  icon={<Calendar className="w-4 h-4" />}
                  className="!max-w-none"
                />
              </div>
            </div>

            {settlementHint && (
              <p className={`text-[11px] font-semibold -mt-2 ${settlementHint.tone}`}>
                {settlementHint.text}
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-[var(--lg-muted)] uppercase tracking-wider mb-1">
                  Pay From Account *
                </label>
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="w-full px-3 rounded-2xl theme-select text-xs font-medium focus:outline-none cursor-pointer"
                  required
                >
                  {activeAccounts.length === 0 ? (
                    <option value="">No accounts</option>
                  ) : (
                    activeAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--lg-muted)] uppercase tracking-wider mb-1">
                  Method
                </label>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                  className="w-full px-3 rounded-2xl theme-select text-xs font-medium focus:outline-none cursor-pointer"
                >
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cheque">Cheque</option>
                  <option value="mobile_wallet">Mobile Wallet</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[var(--lg-muted)] uppercase tracking-wider mb-1">
                Notes
              </label>
              <Input
                placeholder="Payment note or reference"
                value={notes}
                onValueChange={setNotes}
                className="!max-w-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="glass" type="button" onClick={onClose}>
                Cancel
              </Button>
              <Button
                variant="filled"
                tint="#2563EB"
                type="submit"
                disabled={submitting || activeAccounts.length === 0}
              >
                {submitting ? 'Settling…' : 'Confirm Payment'}
              </Button>
            </div>
          </form>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};
