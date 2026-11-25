/**
 * Core Domain Entities (Immutable Type Definitions)
 * Independent of React, DOM, or Firestore SDK.
 */

export interface SoftDeletable {
  readonly isDeleted?: boolean;
  readonly deletedAt?: string | null;
}

export type ProjectStatus = 'planned' | 'active' | 'on_hold' | 'completed' | 'archived';

export interface Project extends SoftDeletable {
  readonly id: string;
  readonly name: string;
  readonly code?: string;
  readonly description?: string;
  readonly clientName?: string;
  readonly location?: string;
  readonly startDate: string;
  readonly targetEndDate?: string;
  readonly actualEndDate?: string;
  readonly status: ProjectStatus;
  readonly budgetMinor: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type ContactRole = 'contractor' | 'worker' | 'supplier' | 'customer' | 'client' | 'other';

export interface Contact extends SoftDeletable {
  readonly id: string;
  readonly name: string;
  readonly companyName?: string;
  readonly phone?: string;
  readonly email?: string;
  readonly roles: readonly ContactRole[];
  readonly notes?: string;
  readonly associatedProjectIds: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type AccountType = 'cash' | 'bank' | 'mobile_wallet' | 'other';

export interface Account extends SoftDeletable {
  readonly id: string;
  readonly name: string;
  readonly type: AccountType;
  readonly institution?: string;
  readonly accountNumber?: string;
  readonly openingBalanceMinor: number;
  readonly currentBalanceMinor: number;
  readonly isArchived: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type ObligationType = 'purchase' | 'contract_bill' | 'labour_wage' | 'customer_invoice';
export type ObligationDirection = 'payable' | 'receivable';
export type ObligationStatus = 'unpaid' | 'partially_paid' | 'paid' | 'voided';

export interface MaterialDetails {
  readonly itemName: string;
  readonly quantity: number;
  readonly unit: string;
  readonly unitPriceMinor: number;
}

export interface Obligation extends SoftDeletable {
  readonly id: string;
  readonly type: ObligationType;
  readonly direction: ObligationDirection;
  readonly projectId?: string;
  readonly contactId?: string;
  readonly title: string;
  readonly date: string;
  readonly totalAmountMinor: number;
  readonly allocatedAmountMinor: number;
  readonly remainingAmountMinor: number;
  readonly status: ObligationStatus;
  readonly materialDetails?: MaterialDetails;
  readonly notes?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type PaymentDirection = 'outgoing' | 'incoming';
export type PaymentMethod = 'cash' | 'bank_transfer' | 'cheque' | 'mobile_wallet' | 'other';
export type PaymentStatus = 'posted' | 'voided';

export interface Payment extends SoftDeletable {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly direction: PaymentDirection;
  readonly accountId: string;
  readonly contactId?: string;
  readonly projectId?: string;
  readonly amountMinor: number;
  readonly allocatedAmountMinor: number;
  readonly unallocatedAmountMinor: number; // Advance credit
  readonly date: string;
  readonly time?: string;
  readonly method: PaymentMethod;
  readonly referenceNumber?: string;
  readonly notes?: string;
  readonly status: PaymentStatus;
  readonly linkedBillId?: string;
  readonly linkedBillTitle?: string;
  readonly billSettlementStatus?: 'paid' | 'partially_paid';
  readonly billTotalMinor?: number;
  readonly billPaidAfterMinor?: number;
  readonly billRemainingAfterMinor?: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface Allocation extends SoftDeletable {
  readonly id: string;
  readonly paymentId: string;
  readonly obligationId: string;
  readonly amountMinor: number;
  readonly date: string;
  readonly createdAt: string;
}

export type TransactionType = 'expense' | 'income' | 'transfer' | 'refund';
export type TransactionScope = 'personal' | 'project';
export type TransactionStatus = 'posted' | 'voided';

export interface Transaction extends SoftDeletable {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly type: TransactionType;
  readonly scope: TransactionScope;
  readonly projectId?: string;
  readonly accountId: string;
  readonly targetAccountId?: string; // Only for transfers
  readonly categoryId?: string;
  readonly contactId?: string;
  readonly amountMinor: number;
  readonly date: string;
  readonly notes?: string;
  readonly status: TransactionStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type BudgetPeriod = 'monthly' | 'weekly';

export interface CategoryBudget extends SoftDeletable {
  readonly id: string;
  readonly categoryId: string;
  readonly categoryLabel: string;
  readonly period: BudgetPeriod;
  readonly limitMinor: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}


