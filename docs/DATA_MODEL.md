# Data Model & Cloud Firestore Schema

## 1. Storage Scoping & Document Path Structure

To guarantee strict tenant isolation, all private data is scoped strictly to the authenticated user's UID. Under no circumstances are global un-scoped collections created.

### Document Path Hierarchy:
* `users/{uid}/projects/{projectId}`
* `users/{uid}/contacts/{contactId}`
* `users/{uid}/accounts/{accountId}`
* `users/{uid}/categories/{categoryId}`
* `users/{uid}/transactions/{transactionId}`
* `users/{uid}/obligations/{obligationId}`
* `users/{uid}/payments/{paymentId}`
* `users/{uid}/allocations/{allocationId}`
* `users/{uid}/budgets/{budgetId}`
* `users/{uid}/settings/preferences`
* `users/{uid}/auditEvents/{auditId}`

---

## 2. Entity Schemas & Field Definitions

All monetary values (`amount`, `balance`, `budget`, `unitPrice`) are stored as **integers in minor units** (e.g., PKR 1,500.00 is stored as `150000`).

### 2.1 Project Entity (`projects`)
```typescript
interface ProjectDocument {
  id: string;                      // UUIDv4
  name: string;                    // "Gulshan Residence"
  code?: string;                   // "PRJ-001"
  description?: string;
  clientName?: string;
  location?: string;
  startDate: string;               // ISO 8601 (YYYY-MM-DD)
  targetEndDate?: string;          // ISO 8601
  actualEndDate?: string;          // ISO 8601
  status: 'planned' | 'active' | 'on_hold' | 'completed' | 'archived';
  budgetMinor: number;             // Integer minor units
  createdAt: string;               // ISO 8601 timestamp
  updatedAt: string;
}
```

### 2.2 Contact Entity (`contacts`)
```typescript
interface ContactDocument {
  id: string;
  name: string;
  companyName?: string;
  phone?: string;
  email?: string;
  roles: Array<'contractor' | 'worker' | 'supplier' | 'customer' | 'client' | 'other'>;
  notes?: string;
  associatedProjectIds: string[];  // Fast lookup for project associations
  createdAt: string;
  updatedAt: string;
}
```

### 2.3 Account Entity (`accounts`)
```typescript
interface AccountDocument {
  id: string;
  name: string;                    // "Meezan Current", "Main Cash"
  type: 'cash' | 'bank' | 'mobile_wallet' | 'other';
  institution?: string;            // "Meezan Bank", "Easypaisa"
  accountNumber?: string;          // Last 4 digits or IBAN
  openingBalanceMinor: number;
  currentBalanceMinor: number;     // Denormalized cache, recomputable from ledger
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}
```

### 2.4 Obligation Entity (`obligations`)
*Represents an accrued cost (materials, contract, labour bill) or an accounts receivable (customer bill).*
```typescript
interface ObligationDocument {
  id: string;
  type: 'purchase' | 'contract_bill' | 'labour_wage' | 'customer_invoice';
  direction: 'payable' | 'receivable'; // payable = we owe, receivable = owed to us
  projectId?: string;                  // Null for personal
  contactId?: string;                  // Supplier, contractor, customer
  title: string;                       // "100 Bags Cement"
  date: string;                        // Incurred date (YYYY-MM-DD)
  totalAmountMinor: number;            // Full obligation cost
  allocatedAmountMinor: number;        // Sum of payments applied so far
  remainingAmountMinor: number;        // totalAmountMinor - allocatedAmountMinor
  status: 'unpaid' | 'partially_paid' | 'paid' | 'voided';
  
  // Material details (optional)
  materialDetails?: {
    itemName: string;
    quantity: number;
    unit: string;                      // "bags", "tons", "feet", "sqft", "kg"
    unitPriceMinor: number;
  };

  notes?: string;
  createdAt: string;
  updatedAt: string;
}
```

### 2.5 Payment Entity (`payments`)
*Represents actual cash or bank disbursements or receipts.*
```typescript
interface PaymentDocument {
  id: string;
  idempotencyKey: string;              // Client-generated unique write key
  direction: 'outgoing' | 'incoming';  // outgoing = disbursement, incoming = receipt
  accountId: string;                   // Account debited or credited
  contactId?: string;                  // Payee or Payer
  projectId?: string;                  // Primary project (or unassigned/personal)
  amountMinor: number;                 // Total cash moved
  allocatedAmountMinor: number;        // Amount linked to obligations
  unallocatedAmountMinor: number;      // Advance / unassigned credit
  date: string;                        // ISO 8601 (YYYY-MM-DD)
  time?: string;                       // HH:mm
  method: 'cash' | 'bank_transfer' | 'cheque' | 'mobile_wallet' | 'other';
  referenceNumber?: string;            // Cheque number, bank transaction ref
  notes?: string;
  status: 'posted' | 'voided';
  createdAt: string;
  updatedAt: string;
}
```

### 2.6 Allocation Entity (`allocations`)
*Maps a Payment to an Obligation (handles M:N relationships).*
```typescript
interface AllocationDocument {
  id: string;
  paymentId: string;
  obligationId: string;
  amountMinor: number;
  date: string;
  createdAt: string;
}
```

### 2.7 Standard Transaction Entity (`transactions`)
*For simple non-obligation daily personal/project cash transactions or inter-account transfers.*
```typescript
interface TransactionDocument {
  id: string;
  idempotencyKey: string;
  type: 'expense' | 'income' | 'transfer' | 'refund';
  scope: 'personal' | 'project';
  projectId?: string;
  accountId: string;                   // Source account (or destination for income)
  targetAccountId?: string;             // For transfers
  categoryId?: string;
  contactId?: string;
  amountMinor: number;
  date: string;
  notes?: string;
  status: 'posted' | 'voided';
  createdAt: string;
  updatedAt: string;
}
```

---

## 3. Query Patterns & Compound Index Requirements

Cloud Firestore requires composite indexes for queries filtering on multiple fields or ordering by a different field.

### Required Firestore Composite Indexes:
1. `transactions`: `scope` (ASC) + `date` (DESC)
2. `transactions`: `projectId` (ASC) + `date` (DESC)
3. `transactions`: `accountId` (ASC) + `date` (DESC)
4. `obligations`: `projectId` (ASC) + `status` (ASC) + `date` (DESC)
5. `obligations`: `contactId` (ASC) + `direction` (ASC) + `status` (ASC)
6. `payments`: `contactId` (ASC) + `direction` (ASC) + `date` (DESC) *(Essential for Instant Latest Payment lookup)*
7. `payments`: `projectId` (ASC) + `date` (DESC)
