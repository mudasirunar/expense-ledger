import { Account, Allocation, Payment } from '@/domain/entities';

export interface BillInstallmentItem {
  readonly paymentId: string;
  readonly date: string;
  readonly accountId: string;
  readonly accountName: string;
  readonly amountMinor: number;
  readonly method: Payment['method'];
  readonly createdAt: string;
}

export interface BillPaymentSummary {
  readonly installments: readonly BillInstallmentItem[];
  readonly accountsUsed: readonly string[];
  readonly accountsSummary: string;
}

/**
 * Resolves all non-voided payment installments linked to a specific Bill (Obligation),
 * supporting both direct `payment.linkedBillId` snapshots and legacy `Allocation` links.
 */
export function resolveBillPaymentSummary(
  billId: string,
  payments: readonly Payment[],
  allocations: readonly Allocation[] | undefined,
  accounts: readonly Account[]
): BillPaymentSummary {
  const accountMap = new Map<string, string>();
  for (const a of accounts) {
    accountMap.set(a.id, a.name);
  }

  const paymentMap = new Map<string, Payment>();
  for (const p of payments) {
    if (p.status === 'voided' || p.isDeleted) continue;
    paymentMap.set(p.id, p);
  }

  // Track allocation amount per paymentId so multiple links / snapshots never duplicate
  const amountByPaymentId = new Map<string, number>();

  if (allocations && allocations.length > 0) {
    for (const alloc of allocations) {
      if (alloc.isDeleted || alloc.obligationId !== billId) continue;
      if (!paymentMap.has(alloc.paymentId)) continue;
      amountByPaymentId.set(
        alloc.paymentId,
        (amountByPaymentId.get(alloc.paymentId) || 0) + (alloc.amountMinor || 0)
      );
    }
  }

  for (const pay of paymentMap.values()) {
    if (pay.linkedBillId === billId && !amountByPaymentId.has(pay.id)) {
      const applied =
        pay.allocatedAmountMinor > 0 ? pay.allocatedAmountMinor : pay.amountMinor;
      amountByPaymentId.set(pay.id, applied);
    }
  }

  const installments: BillInstallmentItem[] = [];
  for (const [paymentId, amountMinor] of amountByPaymentId.entries()) {
    const pay = paymentMap.get(paymentId);
    if (!pay) continue;
    installments.push({
      paymentId,
      date: pay.date || '',
      accountId: pay.accountId,
      accountName: accountMap.get(pay.accountId) || 'Account',
      amountMinor,
      method: pay.method,
      createdAt: pay.createdAt || '',
    });
  }

  installments.sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    return a.createdAt.localeCompare(b.createdAt);
  });

  const seenAccounts = new Set<string>();
  const accountsUsed: string[] = [];
  for (const inst of installments) {
    if (!seenAccounts.has(inst.accountName)) {
      seenAccounts.add(inst.accountName);
      accountsUsed.push(inst.accountName);
    }
  }

  return {
    installments,
    accountsUsed,
    accountsSummary: accountsUsed.join(', '),
  };
}

export function formatShortInstallmentDate(dateKey: string): string {
  if (!dateKey) return '—';
  const parsed = new Date(`${dateKey.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateKey;
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
