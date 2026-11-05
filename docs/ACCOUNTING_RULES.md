# Authoritative Accounting Rules & Invariants

## 1. Fundamental Financial Axioms

This application adheres strictly to the accrual principle for multi-project operations and double-entry consistency for cash movements:

1. **Integer Minor Units:** All monetary values are represented as 64-bit integers in minor units (`cents`, `paisa`). Floating point types (`number` with decimals) must never be used in arithmetic operations.
2. **Cost Recognition at Inception (Obligation):** An expense or asset acquisition is recognized at the moment the obligation is incurred (material delivered, contractor milestone reached), regardless of when cash is disbursed.
3. **Payments Settle Payables, Not Duplicate Expenses:** A cash disbursement made against an existing obligation settles the liability. It **must never** be added to the project expense total a second time.
4. **Internal Transfers are P&L-Neutral:** Moving funds between internal accounts (Cash, Bank, Mobile Wallet) changes liquidity distribution but has a net impact of exactly `0` on Income, Expense, and Equity.
5. **No Negative Absolute Quantities:** Transaction and payment amounts must be strictly positive integers (`amountMinor > 0`). Directionality is represented by typed discriminators (`incoming`, `outgoing`, `debit`, `credit`).

---

## 2. Mathematical Examples & Invariants

### 2.1 Scenario: Material Purchase with Staged Partial Payments

* **Day 1: Purchase Obligation Incurred**
  * Supplier "Akram Bricks" delivers 10,000 bricks for **PKR 100,000**.
  * User pays **PKR 40,000** in Cash immediately.
  * **Resulting Ledger State:**
    * Project Expense Incurred: `PKR 100,000`
    * Cash Account Impact: `-PKR 40,000`
    * Akram Bricks Payable Balance: `PKR 60,000`
    * Total Project Cost to date: `PKR 100,000`

* **Day 15: Second Partial Payment**
  * User transfers **PKR 20,000** via Bank to Akram Bricks against the brick obligation.
  * **Resulting Ledger State:**
    * Project Expense Incurred: `PKR 100,000` *(Unchanged)*
    * Bank Account Impact: `-PKR 20,000`
    * Total Paid to Akram Bricks: `PKR 60,000`
    * Akram Bricks Remaining Payable: `PKR 40,000`
    * Total Project Cost to date: `PKR 100,000` *(Must NOT become PKR 160,000)*

* **Day 30: Final Settlement**
  * User pays remaining **PKR 40,000** via Mobile Wallet.
  * **Resulting Ledger State:**
    * Obligation Status: `PAID` (Remaining Payable: `PKR 0`)
    * Total Cash Disbursed: `PKR 100,000`
    * Total Project Cost: `PKR 100,000`

### 2.2 Scenario: Advance Payments (Prepayments)

* **Day 1: Contractor Mobilization Advance**
  * User pays Contractor "Babar" **PKR 50,000** advance before work starts.
  * **Resulting Ledger State:**
    * Babar Unallocated Advance Balance: `PKR 50,000` (Asset / Prepayment)
    * Cash Account Impact: `-PKR 50,000`
    * Project Expense Recognized: `PKR 0` *(Work has not yet been certified/incurred)*

* **Day 10: Contractor Bill 1 Submitted**
  * Babar submits Bill 1 for plastering work: **PKR 80,000**.
  * User certifies the bill (creates Obligation of `PKR 80,000`).
  * System applies the unallocated advance of `PKR 50,000`.
  * **Resulting Ledger State:**
    * Project Expense Incurred: `PKR 80,000`
    * Babar Unallocated Advance: `PKR 0`
    * Babar Remaining Payable: `PKR 30,000`
    * Cash Account Impact: `PKR 0` *(settled from existing advance)*

### 2.3 Scenario: 1-to-Many Payment Allocation

* User pays **PKR 150,000** to Supplier "City Cement" via Cheque/Bank.
* City Cement has 2 pending obligations on Project A:
  1. Delivery 1: `PKR 90,000` (Unpaid)
  2. Delivery 2: `PKR 90,000` (Unpaid)
* **Allocation Calculation:**
  * Allocate `PKR 90,000` to Delivery 1 $\rightarrow$ Status: `PAID` (Remaining: `0`)
  * Allocate remaining `PKR 60,000` to Delivery 2 $\rightarrow$ Status: `PARTIALLY_PAID` (Remaining: `PKR 30,000`)
  * Bank Account Impact: `-PKR 150,000`
  * City Cement Net Payable: `PKR 30,000`

---

## 3. Contact Multi-Project Isolation & Aggregation

* **Rule:** A Contact's participation in multiple projects never crosses project accounting boundaries, but their master profile aggregates their enterprise standing.
* **Example:**
  * Contractor "Zubair" works on:
    * **Project 1 (House):** Total Contract `PKR 200,000`, Total Paid `PKR 150,000` $\rightarrow$ Payable = `PKR 50,000`.
    * **Project 2 (Shop):** Total Contract `PKR 300,000`, Total Paid `PKR 100,000` $\rightarrow$ Payable = `PKR 200,000`.
  * **Project 1 Ledger:** Reports Zubair cost as `PKR 200,000`, payable as `PKR 50,000`.
  * **Project 2 Ledger:** Reports Zubair cost as `PKR 300,000`, payable as `PKR 200,000`.
  * **Zubair Master Contact Profile:**
    * Total Paid Across All Projects: `PKR 250,000`
    * Total Outstanding Payable Across All Projects: `PKR 250,000`
    * Latest Payment: The single most recent payment record between Project 1 and Project 2.

---

## 4. Latest Payment Lookup Specification

* **Incoming vs Outgoing Distinct Ledgers:**
  * Outgoing payments (disbursements) and incoming receipts (collections) are completely isolated in latest-payment calculations.
* **Criteria:**
  * `latestOutgoingPayment` is derived strictly by querying the `payments` collection where `contactId == targetContactId`, `direction == 'outgoing'`, `status == 'posted'`, ordered by `date DESC, createdAt DESC`, limit 1.
  * It returns the exact payment amount, payment date, payment method, account used, and associated project.
  * It **never** references the obligation or contract date.

---

## 5. Account Balances and Deterministic Derivation

An account's balance must always be verifiable and recomputable from its ledger events:

$$\text{Current Balance} = \text{Opening Balance} + \sum \text{Income Receipts} - \sum \text{Expense Disbursements} + \sum \text{Incoming Transfers} - \sum \text{Outgoing Transfers}$$

If a cached balance ever diverges, running the domain recalculator reconciles the cached document with canonical ledger records.

---

## 6. Corrections, Reversals, and Void Invariants

* **No Silent Physical Deletes:** Once a financial transaction, obligation, or payment is posted, it cannot be permanently purged from the database.
* **Voiding an Obligation:**
  * Marks `status = 'voided'`.
  * De-allocates all associated payment allocations, returning those payments to `unallocatedAmountMinor` (Advance status) so the cash is not lost.
  * Adjusts project expense totals downwards.
* **Voiding a Payment:**
  * Marks `status = 'voided'`.
  * De-allocates linked allocations, adjusting obligation remaining balances upwards back to unpaid/partially paid.
  * Restores source account balance (credit or debit reversal).
  * Creates an immutable `auditEvents` document logging user ID, timestamp, and previous state.
