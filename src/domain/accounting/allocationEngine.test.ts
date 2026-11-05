import { describe, it, expect } from 'vitest';
import { AllocationEngine } from './allocationEngine';
import { Obligation, Payment } from '../entities';

describe('Domain Accounting - AllocationEngine Invariants', () => {
  const baseObligation: Obligation = {
    id: 'obl-100',
    type: 'purchase',
    direction: 'payable',
    projectId: 'prj-1',
    contactId: 'cnt-akram',
    title: '10,000 Bricks',
    date: '2026-11-01',
    totalAmountMinor: 10000000, // PKR 100,000.00
    allocatedAmountMinor: 0,
    remainingAmountMinor: 10000000,
    status: 'unpaid',
    createdAt: '2026-11-01T10:00:00Z',
    updatedAt: '2026-11-01T10:00:00Z',
  };

  const payment1: Payment = {
    id: 'pay-1',
    idempotencyKey: 'idem-1',
    direction: 'outgoing',
    accountId: 'acc-cash',
    contactId: 'cnt-akram',
    projectId: 'prj-1',
    amountMinor: 4000000, // PKR 40,000.00
    allocatedAmountMinor: 0,
    unallocatedAmountMinor: 4000000,
    date: '2026-11-01',
    method: 'cash',
    status: 'posted',
    createdAt: '2026-11-01T10:05:00Z',
    updatedAt: '2026-11-01T10:05:00Z',
  };

  it('allocates partial payment correctly: 100k obligation with 40k payment leaves 60k remaining', () => {
    const result = AllocationEngine.allocate(baseObligation, payment1);

    expect(result.updatedObligation.status).toBe('partially_paid');
    expect(result.updatedObligation.allocatedAmountMinor).toBe(4000000);
    expect(result.updatedObligation.remainingAmountMinor).toBe(6000000); // PKR 60,000 remaining
    expect(result.updatedPayment.allocatedAmountMinor).toBe(4000000);
    expect(result.updatedPayment.unallocatedAmountMinor).toBe(0);
    expect(result.allocation.amountMinor).toBe(4000000);
  });

  it('settles obligation fully with subsequent payment', () => {
    // Step 1: First payment of 40k
    const step1 = AllocationEngine.allocate(baseObligation, payment1);

    // Step 2: Second payment of 60k
    const payment2: Payment = {
      id: 'pay-2',
      idempotencyKey: 'idem-2',
      direction: 'outgoing',
      accountId: 'acc-bank',
      contactId: 'cnt-akram',
      amountMinor: 6000000, // PKR 60,000.00
      allocatedAmountMinor: 0,
      unallocatedAmountMinor: 6000000,
      date: '2026-11-15',
      method: 'bank_transfer',
      status: 'posted',
      createdAt: '2026-11-15T12:00:00Z',
      updatedAt: '2026-11-15T12:00:00Z',
    };

    const step2 = AllocationEngine.allocate(step1.updatedObligation, payment2);

    expect(step2.updatedObligation.status).toBe('paid');
    expect(step2.updatedObligation.remainingAmountMinor).toBe(0);
    expect(step2.updatedObligation.allocatedAmountMinor).toBe(10000000);
  });

  it('rejects allocation when requested amount exceeds obligation remaining balance', () => {
    const hugePayment: Payment = {
      ...payment1,
      amountMinor: 20000000, // PKR 200k
      unallocatedAmountMinor: 20000000,
    };

    expect(() => AllocationEngine.allocate(baseObligation, hugePayment, 15000000)).toThrow(/exceeds remaining/);
  });

  it('rejects allocation from a voided payment or voided obligation', () => {
    const voidedPayment: Payment = { ...payment1, status: 'voided' };
    expect(() => AllocationEngine.allocate(baseObligation, voidedPayment)).toThrow(/voided/);

    const voidedObligation: Obligation = { ...baseObligation, status: 'voided' };
    expect(() => AllocationEngine.allocate(voidedObligation, payment1)).toThrow(/status/);
  });

  it('deallocates cleanly and restores unallocated payment funds', () => {
    const allocated = AllocationEngine.allocate(baseObligation, payment1);
    const dealloc = AllocationEngine.deallocate(
      allocated.updatedObligation,
      allocated.updatedPayment,
      allocated.allocation
    );

    expect(dealloc.updatedObligation.status).toBe('unpaid');
    expect(dealloc.updatedObligation.remainingAmountMinor).toBe(10000000);
    expect(dealloc.updatedPayment.unallocatedAmountMinor).toBe(4000000);
  });
});

