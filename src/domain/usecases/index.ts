import { 
  Project, 
  Transaction, 
  Obligation, 
  Payment, 
  MaterialDetails 
} from '../entities';
import { AllocationEngine } from '../accounting/allocationEngine';

/**
 * Pure Domain Use Cases
 * Validates commands, assigns UUIDs & idempotency keys, and computes minor units.
 */

export class DomainUseCases {
  static createProject(params: {
    name: string;
    code?: string;
    description?: string;
    clientName?: string;
    location?: string;
    startDate: string;
    targetEndDate?: string;
    budgetMinor: number;
  }): Project {
    if (!params.name.trim()) {
      throw new Error('[CreateProject] Project name is required.');
    }
    if (params.budgetMinor < 0) {
      throw new Error('[CreateProject] Budget cannot be negative.');
    }

    const now = new Date().toISOString();
    return {
      id: `prj-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name: params.name.trim(),
      code: params.code?.trim(),
      description: params.description?.trim(),
      clientName: params.clientName?.trim(),
      location: params.location?.trim(),
      startDate: params.startDate,
      targetEndDate: params.targetEndDate,
      status: 'active',
      budgetMinor: params.budgetMinor,
      createdAt: now,
      updatedAt: now,
    };
  }

  static recordExpense(params: {
    scope: 'personal' | 'project';
    projectId?: string;
    accountId: string;
    categoryId?: string;
    contactId?: string;
    amountMinor: number;
    date: string;
    notes?: string;
  }): Transaction {
    if (params.amountMinor <= 0) {
      throw new Error('[RecordExpense] Expense amount must be strictly greater than 0.');
    }
    if (params.scope === 'project' && !params.projectId) {
      throw new Error('[RecordExpense] Project expense requires a valid projectId.');
    }

    const now = new Date().toISOString();
    return {
      id: `tx-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      idempotencyKey: `idem-tx-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      type: 'expense',
      scope: params.scope,
      projectId: params.projectId,
      accountId: params.accountId,
      categoryId: params.categoryId,
      contactId: params.contactId,
      amountMinor: params.amountMinor,
      date: params.date,
      notes: params.notes?.trim(),
      status: 'posted',
      createdAt: now,
      updatedAt: now,
    };
  }

  static recordIncome(params: {
    scope: 'personal' | 'project';
    projectId?: string;
    accountId: string;
    categoryId?: string;
    contactId?: string;
    amountMinor: number;
    date: string;
    notes?: string;
  }): Transaction {
    if (params.amountMinor <= 0) {
      throw new Error('[RecordIncome] Income amount must be strictly greater than 0.');
    }

    const now = new Date().toISOString();
    return {
      id: `tx-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      idempotencyKey: `idem-tx-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      type: 'income',
      scope: params.scope,
      projectId: params.projectId,
      accountId: params.accountId,
      categoryId: params.categoryId,
      contactId: params.contactId,
      amountMinor: params.amountMinor,
      date: params.date,
      notes: params.notes?.trim(),
      status: 'posted',
      createdAt: now,
      updatedAt: now,
    };
  }

  static createPurchaseObligation(params: {
    projectId: string;
    contactId: string;
    title: string;
    date: string;
    totalAmountMinor: number;
    materialDetails?: MaterialDetails;
    notes?: string;
  }): Obligation {
    if (params.totalAmountMinor <= 0) {
      throw new Error('[CreatePurchaseObligation] Obligation amount must be positive.');
    }
    if (!params.title.trim()) {
      throw new Error('[CreatePurchaseObligation] Obligation title is required.');
    }

    const now = new Date().toISOString();
    return {
      id: `obl-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      type: 'purchase',
      direction: 'payable',
      projectId: params.projectId,
      contactId: params.contactId,
      title: params.title.trim(),
      date: params.date,
      totalAmountMinor: params.totalAmountMinor,
      allocatedAmountMinor: 0,
      remainingAmountMinor: params.totalAmountMinor,
      status: 'unpaid',
      materialDetails: params.materialDetails,
      notes: params.notes?.trim(),
      createdAt: now,
      updatedAt: now,
    };
  }

  static recordOutgoingPayment(params: {
    accountId: string;
    contactId?: string;
    projectId?: string;
    amountMinor: number;
    date: string;
    method: 'cash' | 'bank_transfer' | 'cheque' | 'mobile_wallet' | 'other';
    referenceNumber?: string;
    notes?: string;
  }): Payment {
    if (params.amountMinor <= 0) {
      throw new Error('[RecordOutgoingPayment] Payment amount must be positive.');
    }

    const now = new Date().toISOString();
    return {
      id: `pay-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      idempotencyKey: `idem-pay-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      direction: 'outgoing',
      accountId: params.accountId,
      contactId: params.contactId,
      projectId: params.projectId,
      amountMinor: params.amountMinor,
      allocatedAmountMinor: 0,
      unallocatedAmountMinor: params.amountMinor, // Initially advance until allocated
      date: params.date,
      method: params.method,
      referenceNumber: params.referenceNumber?.trim(),
      notes: params.notes?.trim(),
      status: 'posted',
      createdAt: now,
      updatedAt: now,
    };
  }

  static allocatePayment(
    obligation: Obligation,
    payment: Payment,
    amountMinor?: number
  ) {
    return AllocationEngine.allocate(obligation, payment, amountMinor);
  }

  static createTransfer(params: {
    sourceAccountId: string;
    targetAccountId: string;
    amountMinor: number;
    date: string;
    notes?: string;
  }): Transaction {
    if (params.amountMinor <= 0) {
      throw new Error('[CreateTransfer] Transfer amount must be positive.');
    }
    if (params.sourceAccountId === params.targetAccountId) {
      throw new Error('[CreateTransfer] Source and target accounts must be distinct.');
    }

    const now = new Date().toISOString();
    return {
      id: `tx-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      idempotencyKey: `idem-tx-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      type: 'transfer',
      scope: 'personal',
      accountId: params.sourceAccountId,
      targetAccountId: params.targetAccountId,
      amountMinor: params.amountMinor,
      date: params.date,
      notes: params.notes?.trim(),
      status: 'posted',
      createdAt: now,
      updatedAt: now,
    };
  }

  static voidTransaction(tx: Transaction): Transaction {
    if (tx.status === 'voided') {
      throw new Error('[VoidTransaction] Transaction is already voided.');
    }
    return {
      ...tx,
      status: 'voided',
      updatedAt: new Date().toISOString(),
    };
  }
}
