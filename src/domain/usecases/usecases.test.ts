import { describe, it, expect } from 'vitest';
import { DomainUseCases } from './index';

describe('Domain Accounting - Application Use Cases', () => {
  it('creates a project with valid metadata and active status', () => {
    const project = DomainUseCases.createProject({
      name: 'Commercial Plaza',
      budgetMinor: 500000000, // 5M
      startDate: '2026-11-01',
    });

    expect(project.id).toMatch(/^prj-/);
    expect(project.status).toBe('active');
    expect(project.budgetMinor).toBe(500000000);
  });

  it('rejects project creation with empty name', () => {
    expect(() => DomainUseCases.createProject({
      name: '  ',
      budgetMinor: 1000,
      startDate: '2026-11-01',
    })).toThrow(/required/);
  });

  it('records personal expense and generates idempotency key', () => {
    const tx = DomainUseCases.recordExpense({
      scope: 'personal',
      accountId: 'acc-cash',
      amountMinor: 250000, // PKR 2,500
      date: '2026-11-05',
      notes: 'Lunch with contractor',
    });

    expect(tx.id).toMatch(/^tx-/);
    expect(tx.idempotencyKey).toMatch(/^idem-tx-/);
    expect(tx.status).toBe('posted');
    expect(tx.amountMinor).toBe(250000);
  });

  it('creates purchase obligation with full remaining amount', () => {
    const obl = DomainUseCases.createPurchaseObligation({
      projectId: 'prj-house',
      contactId: 'cnt-cement',
      title: '50 Bags Falcon Cement',
      date: '2026-11-05',
      totalAmountMinor: 7500000, // PKR 75,000
    });

    expect(obl.status).toBe('unpaid');
    expect(obl.remainingAmountMinor).toBe(7500000);
    expect(obl.allocatedAmountMinor).toBe(0);
  });

  it('creates inter-account transfer and rejects transfer to same account', () => {
    const transfer = DomainUseCases.createTransfer({
      sourceAccountId: 'acc-bank',
      targetAccountId: 'acc-cash',
      amountMinor: 5000000, // PKR 50,000
      date: '2026-11-05',
    });

    expect(transfer.type).toBe('transfer');
    expect(transfer.accountId).toBe('acc-bank');
    expect(transfer.targetAccountId).toBe('acc-cash');

    expect(() => DomainUseCases.createTransfer({
      sourceAccountId: 'acc-cash',
      targetAccountId: 'acc-cash',
      amountMinor: 1000,
      date: '2026-11-05',
    })).toThrow(/distinct/);
  });

  it('voids transaction without destroying canonical record', () => {
    const tx = DomainUseCases.recordExpense({
      scope: 'personal',
      accountId: 'acc-cash',
      amountMinor: 50000,
      date: '2026-11-05',
    });

    const voided = DomainUseCases.voidTransaction(tx);
    expect(voided.status).toBe('voided');
    expect(voided.id).toBe(tx.id);
  });
});

