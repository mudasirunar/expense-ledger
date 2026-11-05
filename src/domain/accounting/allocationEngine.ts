import { Obligation, Payment, Allocation } from '../entities';

export interface AllocationResult {
  updatedObligation: Obligation;
  updatedPayment: Payment;
  allocation: Allocation;
}

export class AllocationEngine {
  /**
   * Applies an amount from a Payment to an Obligation.
   * Enforces financial invariants:
   * 1. Cannot allocate more than obligation's remaining balance.
   * 2. Cannot allocate more than payment's unallocated funds.
   * 3. Symmetrical for outgoing disbursements vs incoming receipts.
   */
  static allocate(
    obligation: Obligation,
    payment: Payment,
    requestedAmountMinor?: number
  ): AllocationResult {
    if (obligation.status === 'paid' || obligation.status === 'voided') {
      throw new Error(`[AllocationEngine] Cannot allocate to obligation with status: ${obligation.status}`);
    }

    if (payment.status === 'voided') {
      throw new Error(`[AllocationEngine] Cannot allocate from a voided payment`);
    }

    if (payment.unallocatedAmountMinor <= 0) {
      throw new Error(`[AllocationEngine] Payment has zero unallocated funds available`);
    }

    // Determine allocation amount: default to the max possible
    const maxPossible = Math.min(obligation.remainingAmountMinor, payment.unallocatedAmountMinor);
    const amountToAllocate = requestedAmountMinor !== undefined ? requestedAmountMinor : maxPossible;

    if (amountToAllocate <= 0) {
      throw new Error(`[AllocationEngine] Allocation amount must be positive. Received: ${amountToAllocate}`);
    }

    if (amountToAllocate > obligation.remainingAmountMinor) {
      throw new Error(
        `[AllocationEngine] Cannot allocate ${amountToAllocate} - exceeds remaining obligation of ${obligation.remainingAmountMinor}`
      );
    }

    if (amountToAllocate > payment.unallocatedAmountMinor) {
      throw new Error(
        `[AllocationEngine] Cannot allocate ${amountToAllocate} - exceeds available unallocated payment of ${payment.unallocatedAmountMinor}`
      );
    }

    const newObligationAllocated = obligation.allocatedAmountMinor + amountToAllocate;
    const newObligationRemaining = obligation.totalAmountMinor - newObligationAllocated;
    const newObligationStatus = newObligationRemaining === 0 ? 'paid' : 'partially_paid';

    const newPaymentAllocated = payment.allocatedAmountMinor + amountToAllocate;
    const newPaymentUnallocated = payment.amountMinor - newPaymentAllocated;

    const allocationId = `alloc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const nowIso = new Date().toISOString();

    const allocation: Allocation = {
      id: allocationId,
      paymentId: payment.id,
      obligationId: obligation.id,
      amountMinor: amountToAllocate,
      date: payment.date,
      createdAt: nowIso,
    };

    const updatedObligation: Obligation = {
      ...obligation,
      allocatedAmountMinor: newObligationAllocated,
      remainingAmountMinor: newObligationRemaining,
      status: newObligationStatus,
      updatedAt: nowIso,
    };

    const updatedPayment: Payment = {
      ...payment,
      allocatedAmountMinor: newPaymentAllocated,
      unallocatedAmountMinor: newPaymentUnallocated,
      updatedAt: nowIso,
    };

    return {
      updatedObligation,
      updatedPayment,
      allocation,
    };
  }

  /**
   * Deallocates (unlinks) an allocation, reversing its effect on both Obligation and Payment.
   * Used when voiding a payment or obligation.
   */
  static deallocate(
    obligation: Obligation,
    payment: Payment,
    allocation: Allocation
  ): { updatedObligation: Obligation; updatedPayment: Payment } {
    if (allocation.paymentId !== payment.id || allocation.obligationId !== obligation.id) {
      throw new Error(`[AllocationEngine] Allocation mismatch for deallocation`);
    }

    const deallocAmount = allocation.amountMinor;
    const newObligationAllocated = Math.max(0, obligation.allocatedAmountMinor - deallocAmount);
    const newObligationRemaining = obligation.totalAmountMinor - newObligationAllocated;
    const newObligationStatus = newObligationAllocated === 0 
      ? 'unpaid' 
      : (newObligationRemaining === 0 ? 'paid' : 'partially_paid');

    const newPaymentAllocated = Math.max(0, payment.allocatedAmountMinor - deallocAmount);
    const newPaymentUnallocated = payment.amountMinor - newPaymentAllocated;

    const nowIso = new Date().toISOString();

    return {
      updatedObligation: {
        ...obligation,
        allocatedAmountMinor: newObligationAllocated,
        remainingAmountMinor: newObligationRemaining,
        status: newObligationStatus,
        updatedAt: nowIso,
      },
      updatedPayment: {
        ...payment,
        allocatedAmountMinor: newPaymentAllocated,
        unallocatedAmountMinor: newPaymentUnallocated,
        updatedAt: nowIso,
      },
    };
  }
}

