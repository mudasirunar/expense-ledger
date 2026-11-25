import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  FileText,
  Loader2,
  Share,
} from 'lucide-react';
import { Button } from 'glisse';
import { Account, Contact, Obligation, Payment, Project, Transaction } from '@/domain/entities';
import { Money } from '@/domain/accounting/money';
import { ActivityFeedItem } from '@/domain/accounting/dashboardAnalytics';
import { ModalPortal } from '@/components/common/ModalPortal';
import { useAuth } from '@/app/providers/AuthProvider';
import { useSnackbar } from '@/app/providers/SnackbarProvider';
import { ReceiptVisualKind, shareReceiptImage } from '@/data/sync/receiptShareService';

function formatFullDate(dateKey: string | undefined): string {
  if (!dateKey) return '—';
  const parsed = new Date(`${dateKey.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateKey;
  return parsed.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTimeFromIso(iso: string | undefined, explicitTime?: string): string | null {
  if (explicitTime && explicitTime.trim()) return explicitTime.trim();
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function formatLabel(raw: string | undefined): string {
  if (!raw) return '—';
  return raw
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

interface DetailRow {
  label: string;
  value: string;
  highlight?: 'positive' | 'negative' | 'warning';
  mono?: boolean;
}

export interface ActivityDetailSheetProps {
  selectedItem: ActivityFeedItem | null;
  onClose: () => void;
  accounts: readonly Account[];
  projects: readonly Project[];
  contacts: readonly Contact[];
  transactions: readonly Transaction[];
  obligations: readonly Obligation[];
  payments: readonly Payment[];
}

export const ActivityDetailSheet: React.FC<ActivityDetailSheetProps> = ({
  selectedItem,
  onClose,
  accounts,
  projects,
  contacts,
  transactions,
  obligations,
  payments,
}) => {
  const { user } = useAuth();
  const { showSnackbar } = useSnackbar();
  const [isSharingReceipt, setIsSharingReceipt] = useState(false);

  useEffect(() => {
    if (!selectedItem) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedItem, onClose]);

  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const contactMap = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);

  const selectedDetails = useMemo<{
    rows: DetailRow[];
    notes?: string;
    recordId?: string;
    visualKind: ReceiptVisualKind;
    receiptBadge: string;
    isPaidBill?: boolean;
  } | null>(() => {
    if (!selectedItem) return null;

    const rows: DetailRow[] = [];

    if (selectedItem.kind === 'transaction') {
      const rawId = selectedItem.id.replace(/^tx-/, '');
      const tx = transactions.find((t) => t.id === rawId);
      if (!tx) {
        return { rows, visualKind: 'expense', receiptBadge: selectedItem.badge };
      }

      const fromAcc = accountMap.get(tx.accountId);
      const toAcc = tx.targetAccountId ? accountMap.get(tx.targetAccountId) : undefined;
      const proj = tx.projectId ? projectMap.get(tx.projectId) : undefined;
      const contact = tx.contactId ? contactMap.get(tx.contactId) : undefined;
      const timeStr = formatTimeFromIso(tx.createdAt);

      rows.push({ label: 'Type', value: formatLabel(tx.type) });
      rows.push({ label: 'Date', value: formatFullDate(tx.date) });
      if (timeStr) rows.push({ label: 'Time', value: timeStr });

      if (tx.type === 'transfer') {
        rows.push({ label: 'From Account', value: fromAcc?.name || 'Account' });
        rows.push({ label: 'To Account', value: toAcc?.name || 'Account' });
      } else {
        rows.push({
          label: tx.type === 'income' || tx.type === 'refund' ? 'Deposited Into' : 'Paid From',
          value: fromAcc?.name || 'Account',
        });
        rows.push({ label: 'Scope', value: proj ? proj.name : 'Personal' });
        if (proj?.code) rows.push({ label: 'Project Code', value: proj.code });
        if (tx.categoryId) rows.push({ label: 'Category', value: formatLabel(tx.categoryId) });
        if (contact) rows.push({ label: 'Contact', value: contact.name });
      }

      const visualKind: ReceiptVisualKind =
        tx.type === 'transfer'
          ? 'transfer'
          : tx.type === 'income' || tx.type === 'refund'
            ? 'income'
            : 'expense';

      return {
        rows,
        notes: tx.notes,
        recordId: tx.id,
        visualKind,
        receiptBadge: formatLabel(tx.type).toUpperCase(),
      };
    }

    if (selectedItem.kind === 'obligation') {
      const rawId = selectedItem.id.replace(/^ob-/, '');
      const ob = obligations.find((o) => o.id === rawId);
      if (!ob) {
        return { rows, visualKind: 'bill', receiptBadge: 'BILL' };
      }

      const proj = ob.projectId ? projectMap.get(ob.projectId) : undefined;
      const contact = ob.contactId ? contactMap.get(ob.contactId) : undefined;
      const timeStr = formatTimeFromIso(ob.createdAt);

      rows.push({ label: 'Type', value: formatLabel(ob.type) });
      rows.push({
        label: 'Direction',
        value: ob.direction === 'payable' ? 'Payable (You Owe)' : 'Receivable (Owed to You)',
      });
      rows.push({ label: 'Status', value: formatLabel(ob.status) });
      rows.push({ label: 'Date', value: formatFullDate(ob.date) });
      if (timeStr) rows.push({ label: 'Time', value: timeStr });

      if (ob.allocatedAmountMinor > 0) {
        rows.push({
          label: 'Paid',
          value: Money.format(ob.allocatedAmountMinor),
          highlight: 'positive',
        });
        rows.push({
          label: 'Remaining',
          value: Money.format(ob.remainingAmountMinor),
          highlight: ob.remainingAmountMinor > 0 ? 'negative' : undefined,
        });
      }

      if (proj) rows.push({ label: 'Project', value: proj.name });
      if (contact) rows.push({ label: 'Contact', value: contact.name });

      if (ob.materialDetails) {
        const { itemName, quantity, unit, unitPriceMinor } = ob.materialDetails;
        rows.push({ label: 'Material', value: itemName });
        if (quantity > 0 && unitPriceMinor > 0) {
          rows.push({
            label: 'Quantity',
            value: `${quantity} ${unit} × ${Money.format(unitPriceMinor)}`,
          });
        }
      }

      return {
        rows,
        notes: ob.notes,
        recordId: ob.id,
        visualKind: 'bill',
        receiptBadge: `BILL • ${formatLabel(ob.status).toUpperCase()}`,
        isPaidBill: ob.status === 'paid',
      };
    }

    const rawId = selectedItem.id.replace(/^pay-/, '');
    const pay = payments.find((p) => p.id === rawId);
    if (!pay) {
      return { rows, visualKind: 'payment', receiptBadge: 'PAYMENT' };
    }

    const acc = accountMap.get(pay.accountId);
    const proj = pay.projectId ? projectMap.get(pay.projectId) : undefined;
    const contact = pay.contactId ? contactMap.get(pay.contactId) : undefined;
    const timeStr = formatTimeFromIso(pay.createdAt, pay.time);

    rows.push({
      label: 'Direction',
      value: pay.direction === 'incoming' ? 'Incoming Receipt' : 'Outgoing Payment',
    });
    rows.push({ label: 'Date', value: formatFullDate(pay.date) });
    if (timeStr) rows.push({ label: 'Time', value: timeStr });
    rows.push({ label: 'Account', value: acc?.name || 'Account' });
    rows.push({ label: 'Method', value: formatLabel(pay.method) });
    if (proj) rows.push({ label: 'Project', value: proj.name });
    if (contact) rows.push({ label: 'Contact', value: contact.name });
    if (pay.allocatedAmountMinor > 0) {
      rows.push({ label: 'Allocated to Bills', value: Money.format(pay.allocatedAmountMinor) });
    }
    if (pay.unallocatedAmountMinor > 0) {
      rows.push({
        label: 'Unallocated Advance',
        value: Money.format(pay.unallocatedAmountMinor),
        highlight: 'warning',
      });
    }
    if (pay.referenceNumber) rows.push({ label: 'Reference #', value: pay.referenceNumber, mono: true });

    return {
      rows,
      notes: pay.notes,
      recordId: pay.id,
      visualKind: 'payment',
      receiptBadge: `PAYMENT • ${selectedItem.badge.toUpperCase()}`,
    };
  }, [selectedItem, transactions, obligations, payments, accountMap, projectMap, contactMap]);

  const handleShareReceipt = async () => {
    if (!selectedItem || !selectedDetails || isSharingReceipt) return;
    setIsSharingReceipt(true);
    try {
      const signedAmount = `${
        selectedItem.direction === 'in' ? '+' : selectedItem.direction === 'out' ? '-' : ''
      }${Money.format(selectedItem.amountMinor)}`;

      const outcome = await shareReceiptImage({
        kind: selectedDetails.visualKind,
        badge: selectedDetails.receiptBadge,
        title: selectedItem.title,
        amountText: signedAmount,
        rows: selectedDetails.rows.map((r) => ({ label: r.label, value: r.value })),
        notes: selectedDetails.notes,
        recordId: selectedDetails.recordId || selectedItem.id,
        isPaidBill: selectedDetails.isPaidBill,
        issuer: {
          name: user?.displayName || 'Authorized User',
          email: user?.email,
          photoURL: user?.photoURL,
        },
      });

      if (outcome === 'downloaded') {
        showSnackbar({ message: 'Receipt image saved.', tone: 'success' });
      }
    } catch (error) {
      console.error('[ActivityDetailSheet] Receipt share failed:', error);
      showSnackbar({
        message: 'Could not generate receipt image. Please try again.',
        tone: 'error',
      });
    } finally {
      setIsSharingReceipt(false);
    }
  };

  if (!selectedItem || !selectedDetails) return null;

  return (
    <ModalPortal isOpen={true}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Transaction details"
        data-bottom-sheet="true"
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/25 dark:bg-black/60 backdrop-blur-sm overscroll-none"
        onClick={onClose}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full sm:max-w-md max-h-[85vh] overflow-y-auto overscroll-contain rounded-t-3xl sm:rounded-3xl px-5 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] sm:pb-6 shadow-2xl box-border bg-[var(--lg-surface)] border-t border-x-0 sm:border border-[var(--lg-surface-edge)] backdrop-blur-2xl space-y-5"
        >
          {/* Drag Handle Pill */}
          <div className="flex justify-center sm:hidden">
            <div className="w-10 h-1 rounded-full bg-[var(--lg-muted)]/30" />
          </div>

          {/* Header: Icon + Title + Circular Glisse iOS Share Button */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                  selectedItem.direction === 'neutral'
                    ? 'bg-blue-500/12 text-blue-600 dark:text-blue-400'
                    : selectedItem.direction === 'in'
                      ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400'
                      : 'bg-rose-500/12 text-rose-600 dark:text-rose-400'
                }`}
              >
                {selectedItem.direction === 'neutral' ? (
                  <ArrowLeftRight className="w-5 h-5" />
                ) : selectedItem.kind === 'obligation' ? (
                  <FileText className="w-5 h-5" />
                ) : selectedItem.direction === 'in' ? (
                  <ArrowDownLeft className="w-5 h-5" />
                ) : (
                  <ArrowUpRight className="w-5 h-5" />
                )}
              </div>

              <div className="min-w-0">
                <h2 className="text-base font-extrabold text-[var(--lg-foreground)] truncate">
                  {selectedItem.title}
                </h2>
                <p className="text-[11px] font-semibold text-[var(--lg-muted)] uppercase tracking-wider">
                  {selectedItem.badge}
                </p>
              </div>
            </div>

            <Button
              variant="glass"
              type="button"
              aria-label="Share receipt"
              onClick={handleShareReceipt}
              disabled={isSharingReceipt}
              icon={
                isSharingReceipt ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Share className="w-4 h-4" />
                )
              }
              className="!p-2 !rounded-full !w-9 !h-9 flex-shrink-0"
            />
          </div>

          {/* Hero Amount */}
          <div className="py-1">
            <p
              className={`text-3xl font-black tabular-nums tracking-tight ${
                selectedItem.direction === 'neutral'
                  ? 'text-[var(--lg-foreground)]'
                  : selectedItem.direction === 'in'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {selectedItem.direction === 'in' ? '+' : selectedItem.direction === 'out' ? '-' : ''}
              {Money.format(selectedItem.amountMinor)}
            </p>
          </div>

          {/* Clean Key-Value Details */}
          <div className="space-y-2.5 text-xs">
            {selectedDetails.rows.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-4 py-1">
                <span className="text-[var(--lg-muted)] font-medium flex-shrink-0">
                  {row.label}
                </span>
                <span
                  className={`font-bold text-right truncate tabular-nums ${
                    row.mono ? 'font-mono text-[11px]' : ''
                  } ${
                    row.highlight === 'positive'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : row.highlight === 'negative'
                        ? 'text-rose-600 dark:text-rose-400'
                        : row.highlight === 'warning'
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-[var(--lg-foreground)]'
                  }`}
                >
                  {row.value}
                </span>
              </div>
            ))}
          </div>

          {/* Notes (if any) */}
          {selectedDetails.notes && selectedDetails.notes.trim() && (
            <div className="space-y-1 pt-1">
              <p className="text-[11px] font-bold text-[var(--lg-muted)] uppercase tracking-wider">
                Notes
              </p>
              <p className="text-xs text-[var(--lg-foreground)] leading-relaxed">
                {selectedDetails.notes}
              </p>
            </div>
          )}

          {/* Subtle Record ID */}
          {selectedDetails.recordId && (
            <p className="text-[10px] font-mono text-[var(--lg-muted)] opacity-60 truncate">
              ID: {selectedDetails.recordId}
            </p>
          )}

          {/* Close Button */}
          <Button
            variant="glass"
            type="button"
            onClick={onClose}
            className="!w-full !py-2.5 !rounded-[24px] font-semibold !text-sm !text-[var(--lg-foreground)]"
          >
            Close
          </Button>
        </div>
      </div>
    </ModalPortal>
  );
};
