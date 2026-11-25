import React, { useMemo, useState } from 'react';
import {
  ChevronLeft,
  FileText,
  Loader2,
  Pencil,
  Share,
} from 'lucide-react';
import { Button } from 'glisse';
import { Account, Allocation, Contact, Obligation, Payment, Project } from '@/domain/entities';
import { Money } from '@/domain/accounting/money';
import {
  formatShortInstallmentDate,
  resolveBillPaymentSummary,
} from '@/domain/accounting/billPaymentsHelper';
import { useAuth } from '@/app/providers/AuthProvider';
import { useSnackbar } from '@/app/providers/SnackbarProvider';
import { shareReceiptImage } from '@/data/sync/receiptShareService';

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

function formatTimeFromIso(iso: string | undefined): string | null {
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
}

interface BillDetailViewProps {
  bill: Obligation;
  accounts: readonly Account[];
  projects: readonly Project[];
  contacts: readonly Contact[];
  payments: readonly Payment[];
  allocations: readonly Allocation[];
  onBack: () => void;
  onPayBill: (bill: Obligation) => void;
  onEditBill: (bill: Obligation) => void;
}

export const BillDetailView: React.FC<BillDetailViewProps> = ({
  bill,
  accounts,
  projects,
  contacts,
  payments,
  allocations,
  onBack,
  onPayBill,
  onEditBill,
}) => {
  const { user } = useAuth();
  const { showSnackbar } = useSnackbar();
  const [isSharingReceipt, setIsSharingReceipt] = useState(false);

  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const contactMap = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);

  const isOpen = bill.status !== 'paid' && bill.remainingAmountMinor > 0;
  const canPayBill = Boolean(
    bill.direction === 'payable' &&
      bill.status !== 'paid' &&
      bill.status !== 'voided' &&
      bill.remainingAmountMinor > 0
  );

  const paidPct =
    bill.totalAmountMinor > 0
      ? Math.min(100, Math.round((bill.allocatedAmountMinor * 100) / bill.totalAmountMinor))
      : 0;

  const billPaymentSummary = useMemo(
    () => resolveBillPaymentSummary(bill.id, payments, allocations, accounts),
    [bill.id, payments, allocations, accounts]
  );

  const details = useMemo(() => {
    const rows: DetailRow[] = [];
    const proj = bill.projectId ? projectMap.get(bill.projectId) : undefined;
    const contact = bill.contactId ? contactMap.get(bill.contactId) : undefined;
    const timeStr = formatTimeFromIso(bill.createdAt);

    rows.push({ label: 'Type', value: formatLabel(bill.type) });
    rows.push({
      label: 'Direction',
      value: bill.direction === 'payable' ? 'Payable' : 'Receivable',
    });
    rows.push({
      label: 'Status',
      value: formatLabel(bill.status),
      highlight:
        bill.status === 'paid'
          ? 'positive'
          : bill.status === 'partially_paid'
            ? 'warning'
            : 'negative',
    });
    rows.push({ label: 'Date', value: formatFullDate(bill.date) });
    if (timeStr) rows.push({ label: 'Time', value: timeStr });

    if (bill.allocatedAmountMinor > 0) {
      rows.push({
        label: 'Paid',
        value: Money.format(bill.allocatedAmountMinor),
        highlight: 'positive',
      });
      rows.push({
        label: 'Remaining',
        value: Money.format(bill.remainingAmountMinor),
        highlight: bill.remainingAmountMinor > 0 ? 'negative' : undefined,
      });
    }

    if (proj) rows.push({ label: 'Project', value: proj.name });
    if (contact) rows.push({ label: 'Contact', value: contact.name });

    if (bill.materialDetails) {
      const { itemName, quantity, unit, unitPriceMinor } = bill.materialDetails;
      rows.push({ label: 'Material', value: itemName });
      if (quantity > 0 && unitPriceMinor > 0) {
        rows.push({
          label: 'Quantity',
          value: `${quantity} ${unit} × ${Money.format(unitPriceMinor)}`,
        });
      }
    }

    const paymentBreakdown =
      billPaymentSummary.installments.length > 0
        ? billPaymentSummary.installments.map((inst) => ({
            label: `${formatShortInstallmentDate(inst.date)} • ${inst.accountName}`,
            amountText: Money.format(inst.amountMinor),
          }))
        : undefined;

    return {
      rows,
      paymentBreakdown,
      paymentBreakdownTotalText:
        paymentBreakdown && bill.allocatedAmountMinor > 0
          ? Money.format(bill.allocatedAmountMinor)
          : undefined,
      receiptBadge: `BILL • ${formatLabel(bill.status).toUpperCase()}`,
      isPaidBill: bill.status === 'paid',
    };
  }, [bill, projectMap, contactMap, billPaymentSummary]);

  const handleShareReceipt = async () => {
    if (isSharingReceipt) return;
    setIsSharingReceipt(true);
    try {
      const signedAmount = `${bill.direction === 'receivable' ? '+' : '-'}${Money.format(bill.totalAmountMinor)}`;
      const outcome = await shareReceiptImage({
        kind: 'bill',
        badge: details.receiptBadge,
        title: bill.title || 'Bill',
        amountText: signedAmount,
        rows: details.rows.map((r) => ({ label: r.label, value: r.value })),
        paymentBreakdown: details.paymentBreakdown,
        paymentBreakdownTotalText: details.paymentBreakdownTotalText,
        notes: bill.notes,
        recordId: bill.id,
        isPaidBill: details.isPaidBill,
        issuer: {
          name: user?.displayName || 'Authorized User',
          email: user?.email,
          photoURL: user?.photoURL,
        },
      });

      if (outcome === 'shared') {
        showSnackbar({ message: 'Receipt shared.', tone: 'success' });
      } else if (outcome === 'downloaded') {
        showSnackbar({ message: 'Receipt image saved.', tone: 'success' });
      }
    } catch (error) {
      console.error('[BillDetailView] Receipt share failed:', error);
      showSnackbar({
        message: 'Could not generate receipt image. Please try again.',
        tone: 'error',
      });
    } finally {
      setIsSharingReceipt(false);
    }
  };

  return (
    <div className="flex flex-col app-screen w-full bg-[#E2DDD5] dark:bg-background text-slate-900 dark:text-slate-100 overflow-hidden font-sans transition-colors duration-200">
      <div className="flex-1 overflow-y-auto scroll-container overscroll-y-contain no-scrollbar">
        <div
          className="w-full select-none pointer-events-none"
          style={{ height: 'var(--top-spacer, env(safe-area-inset-top, 0px))' }}
        />

        {/* Standalone Top Bar: < Back on left, Share on right */}
        <header className="w-full px-4 py-2.5 flex items-center justify-between gap-3 select-none">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="glass"
              aria-label="Go back"
              onClick={onBack}
              icon={<ChevronLeft className="!w-6 !h-6" />}
              className="!p-0 !rounded-full !w-[44px] !h-[44px] flex-shrink-0"
            />
            <h1 className="text-xl font-extrabold text-[var(--lg-foreground)] tracking-tight truncate">
              Bill Details
            </h1>
          </div>

          <Button
            variant="glass"
            type="button"
            aria-label="Share receipt"
            onClick={handleShareReceipt}
            disabled={isSharingReceipt}
            icon={
              isSharingReceipt ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Share className="w-5 h-5" />
              )
            }
            className="!p-0 !rounded-full !w-[44px] !h-[44px] flex-shrink-0"
          />
        </header>

        <main className="max-w-md mx-auto w-full px-4 pt-3 pb-12 space-y-5">
          {/* Identity + Hero Amount */}
          <section className="space-y-3">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                  !isOpen
                    ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400'
                    : bill.allocatedAmountMinor > 0
                      ? 'bg-amber-500/12 text-amber-600 dark:text-amber-400'
                      : 'bg-rose-500/12 text-rose-600 dark:text-rose-400'
                }`}
              >
                <FileText className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-extrabold text-[var(--lg-foreground)] truncate">
                  {bill.title}
                </h2>
                <p
                  className={`text-[11px] font-bold uppercase tracking-wider ${
                    !isOpen
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : bill.allocatedAmountMinor > 0
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {formatLabel(bill.status)}
                </p>
              </div>
            </div>

            <p
              className={`text-3xl font-black tabular-nums tracking-tight ${
                !isOpen
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {bill.direction === 'receivable' ? '+' : '-'}
              {Money.format(bill.totalAmountMinor)}
            </p>

            {/* Settlement Progress Bar */}
            <div className="space-y-1.5 pt-1">
              <div className="w-full h-2 rounded-full bg-[var(--lg-separator)] overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    !isOpen
                      ? 'bg-emerald-500'
                      : paidPct > 0
                        ? 'bg-amber-500'
                        : 'bg-rose-500/30'
                  }`}
                  style={{ width: `${paidPct}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-[var(--lg-muted)] tabular-nums">
                <span>
                  Paid <strong className="text-[var(--lg-foreground)]">{Money.format(bill.allocatedAmountMinor)}</strong>
                </span>
                <span className="font-bold">{paidPct}% settled</span>
              </div>
            </div>
          </section>

          {/* Key-Value Details */}
          <section className="pt-4 border-t border-[var(--lg-separator)] space-y-2.5 text-xs">
            {details.rows.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-4 py-1">
                <span className="text-[var(--lg-muted)] font-medium flex-shrink-0">
                  {row.label}
                </span>
                <span
                  className={`font-bold text-right truncate tabular-nums ${
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
          </section>

          {/* Payment Breakdown */}
          {details.paymentBreakdown && details.paymentBreakdown.length > 0 && (
            <section className="pt-4 border-t border-[var(--lg-separator)] space-y-2">
              <p className="text-[11px] font-bold text-[var(--lg-muted)] uppercase tracking-wider">
                Payment Breakdown
              </p>
              <div className="space-y-1.5">
                {details.paymentBreakdown.map((entry, idx) => (
                  <div
                    key={`${entry.label}-${idx}`}
                    className="flex items-center justify-between gap-3 text-xs py-1"
                  >
                    <span className="text-[var(--lg-muted)] font-medium truncate">
                      {entry.label}
                    </span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums flex-shrink-0">
                      {entry.amountText}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Notes */}
          {bill.notes && bill.notes.trim() && (
            <section className="pt-4 border-t border-[var(--lg-separator)] space-y-1">
              <p className="text-[11px] font-bold text-[var(--lg-muted)] uppercase tracking-wider">
                Notes
              </p>
              <p className="text-xs text-[var(--lg-foreground)] leading-relaxed">
                {bill.notes}
              </p>
            </section>
          )}

          {/* Subtle Record ID */}
          <p className="text-[10px] font-mono text-[var(--lg-muted)] opacity-60 truncate">
            ID: {bill.id}
          </p>

          {/* Bottom Actions: Pay Bill & Edit (no Close button) */}
          {bill.status !== 'voided' && (
            <div className="flex items-center gap-2.5 pt-2">
              {canPayBill && (
                <Button
                  variant="filled"
                  tint="#2563EB"
                  type="button"
                  onClick={() => onPayBill(bill)}
                  className="!flex-1 !py-2.5 !rounded-[24px] font-bold !text-sm"
                >
                  Pay Bill
                </Button>
              )}
              <Button
                variant="glass"
                type="button"
                onClick={() => onEditBill(bill)}
                icon={<Pencil className="w-4 h-4" />}
                className={`${canPayBill ? '!px-5' : '!w-full'} !py-2.5 !rounded-[24px] font-semibold !text-sm !text-[var(--lg-foreground)]`}
              >
                Edit
              </Button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
