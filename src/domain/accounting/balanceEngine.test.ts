import { describe, it, expect } from 'vitest';
import { BalanceEngine } from './balanceEngine';
import { Account, Transaction, Payment, Obligation, Project, Contact } from '../entities';

describe('Domain Accounting - BalanceEngine Invariants', () => {
  const cashAccount: Account = {
    id: 'acc-cash',
    name: 'Main Cash',
    type: 'cash',
    openingBalanceMinor: 10000000, // PKR 100,000.00
    currentBalanceMinor: 10000000,
    isArchived: false,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  };

  const bankAccount: Account = {
    id: 'acc-bank',
    name: 'Meezan Bank',
    type: 'bank',
    openingBalanceMinor: 50000000, // PKR 500,000.00
    currentBalanceMinor: 50000000,
    isArchived: false,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  };

  it('calculates account balance accurately after expense, income, and transfer', () => {
    const transactions: Transaction[] = [
      {
        id: 'tx-1',
        idempotencyKey: 'idem-tx-1',
        type: 'expense',
        scope: 'personal',
        accountId: 'acc-cash',
        amountMinor: 1500000, // -PKR 15,000
        date: '2026-11-02',
        status: 'posted',
        createdAt: '2026-11-02T10:00:00Z',
        updatedAt: '2026-11-02T10:00:00Z',
      },
      {
        id: 'tx-2',
        idempotencyKey: 'idem-tx-2',
        type: 'income',
        scope: 'personal',
        accountId: 'acc-cash',
        amountMinor: 2500000, // +PKR 25,000
        date: '2026-11-03',
        status: 'posted',
        createdAt: '2026-11-03T10:00:00Z',
        updatedAt: '2026-11-03T10:00:00Z',
      },
      {
        id: 'tx-3',
        idempotencyKey: 'idem-tx-3',
        type: 'transfer',
        scope: 'personal',
        accountId: 'acc-cash', // From cash
        targetAccountId: 'acc-bank', // To bank
        amountMinor: 3000000, // PKR 30,000
        date: '2026-11-04',
        status: 'posted',
        createdAt: '2026-11-04T10:00:00Z',
        updatedAt: '2026-11-04T10:00:00Z',
      },
    ];

    // Cash: 100k - 15k + 25k - 30k = 80k (8,000,000 minor)
    const newCash = BalanceEngine.computeAccountBalance(cashAccount, transactions, []);
    expect(newCash).toBe(8000000);

    // Bank: 500k + 30k = 530k (53,000,000 minor)
    const newBank = BalanceEngine.computeAccountBalance(bankAccount, transactions, []);
    expect(newBank).toBe(53000000);

    // Total liquidity invariant: 100k + 500k = 600k initial. -15k + 25k = 610k total after.
    expect(newCash + newBank).toBe(61000000);
  });

  it('prevents double-counting project expense when an obligation is paid', () => {
    const project: Project = {
      id: 'prj-house',
      name: 'House Construction',
      status: 'active',
      startDate: '2026-11-01',
      budgetMinor: 300000000, // PKR 3,000,000
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    };

    const cementObligation: Obligation = {
      id: 'obl-cement',
      type: 'purchase',
      direction: 'payable',
      projectId: 'prj-house',
      contactId: 'cnt-supplier',
      title: 'Cement 100 Bags',
      date: '2026-11-01',
      totalAmountMinor: 15000000, // PKR 150,000
      allocatedAmountMinor: 15000000, // Fully paid
      remainingAmountMinor: 0,
      status: 'paid',
      createdAt: '2026-11-01T10:00:00Z',
      updatedAt: '2026-11-01T10:00:00Z',
    };

    const paymentForCement: Payment = {
      id: 'pay-cement',
      idempotencyKey: 'idem-pay-c',
      direction: 'outgoing',
      accountId: 'acc-cash',
      projectId: 'prj-house',
      contactId: 'cnt-supplier',
      amountMinor: 15000000, // PKR 150,000
      allocatedAmountMinor: 15000000,
      unallocatedAmountMinor: 0,
      date: '2026-11-02',
      method: 'cash',
      status: 'posted',
      createdAt: '2026-11-02T10:00:00Z',
      updatedAt: '2026-11-02T10:00:00Z',
    };

    const summary = BalanceEngine.computeProjectSummary(
      project,
      [cementObligation],
      [paymentForCement]
    );

    // Project cost MUST be exactly PKR 150,000 (not PKR 300,000!)
    expect(summary.totalObligationsMinor).toBe(15000000);
    expect(summary.totalPaidMinor).toBe(15000000);
    expect(summary.totalPayableRemainingMinor).toBe(0);
    expect(summary.remainingBudgetMinor).toBe(285000000); // 3M - 150k
  });

  it('computes contact summary and extracts latest payment strictly from posted payments', () => {
    const contact: Contact = {
      id: 'cnt-ahmed',
      name: 'Ahmed Plumber',
      roles: ['worker'],
      associatedProjectIds: ['prj-house'],
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    };

    const payments: Payment[] = [
      {
        id: 'pay-1',
        idempotencyKey: 'idem-p1',
        direction: 'outgoing',
        accountId: 'acc-cash',
        contactId: 'cnt-ahmed',
        amountMinor: 1000000, // PKR 10k
        allocatedAmountMinor: 1000000,
        unallocatedAmountMinor: 0,
        date: '2026-10-15',
        method: 'cash',
        status: 'posted',
        createdAt: '2026-10-15T09:00:00Z',
        updatedAt: '2026-10-15T09:00:00Z',
      },
      {
        id: 'pay-2',
        idempotencyKey: 'idem-p2',
        direction: 'outgoing',
        accountId: 'acc-bank',
        contactId: 'cnt-ahmed',
        amountMinor: 2500000, // PKR 25k (Latest!)
        allocatedAmountMinor: 2500000,
        unallocatedAmountMinor: 0,
        date: '2026-11-03',
        method: 'bank_transfer',
        status: 'posted',
        createdAt: '2026-11-03T14:30:00Z',
        updatedAt: '2026-11-03T14:30:00Z',
      },
    ];

    const summary = BalanceEngine.computeContactSummary(contact, [], payments);

    expect(summary.totalPaidToContactMinor).toBe(3500000); // 35k total
    expect(summary.latestOutgoingPayment?.id).toBe('pay-2');
    expect(summary.latestOutgoingPayment?.amountMinor).toBe(2500000);
    expect(summary.latestOutgoingPayment?.date).toBe('2026-11-03');
  });
});

