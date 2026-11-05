# Comprehensive Quality Assurance & Test Plan

## 1. Testing Philosophy & Test Pyramid

Financial applications require zero tolerance for mathematical drift, rounding errors, or data corruption. Testing is structured across three core tiers:

```
          / \
         /   \     E2E / Device Matrix (iOS PWA, Android Chrome, Safari)
        /     \
       /-------\   Integration & Firestore Emulator Rules Tests
      /         \
     /-----------\ Pure Domain Accounting Unit Tests (Money, Invariants, Allocations)
```

---

## 2. Tier 1: Pure Domain Accounting Unit Tests (Vitest)

Domain unit tests run in memory with zero Firebase dependencies and execute in milliseconds.

### Mandatory Test Suites:
1. **Money & Arithmetic Invariants:**
   * Integer addition, subtraction, and multiplication without floating point loss.
   * Formatters (`formatMinorUnitsToCurrency(15000000, 'PKR') === 'PKR 150,000.00'`).
   * Rejection of negative amounts for base transactions.
2. **Obligation & Partial Payment Calculations:**
   * Full settlement on creation $\rightarrow$ remaining balance = `0`, status = `PAID`.
   * Partial payment $\rightarrow$ obligation balance decreases, project cost remains equal to initial obligation total.
   * Multiple partial payments totaling the exact obligation amount $\rightarrow$ status flips to `PAID`.
   * Overpayment prevention $\rightarrow$ rejects allocation greater than remaining payable.
3. **Advance Payments (Prepayments):**
   * Unallocated advance registers as asset/credit on contact.
   * Applying advance to subsequent obligation reduces payable without moving cash.
4. **Internal Transfers:**
   * Transfer between Cash and Bank shifts liquidity; sum of all balances remains constant; net P&L impact = `0`.
5. **Multi-Project Contact Isolation:**
   * Contractor working on 2 projects maintains isolated project balances.
   * Contact summary aggregates cross-project totals accurately.
6. **Latest Payment Derivation:**
   * Verify latest payment is selected strictly from posted payment records, ignoring obligation dates.
   * Ensure incoming receipts and outgoing disbursements are evaluated independently.
7. **Reversals and Voids:**
   * Voiding a payment de-allocates obligations and restores account balance.
   * Voiding an obligation returns allocated funds to unallocated credit.

---

## 3. Tier 2: Firestore Security Rules Emulator Tests

Tested using `@firebase/rules-unit-testing`:
1. **Unauthenticated Access:** Verify unauthenticated reads/writes are denied across all paths.
2. **Cross-User Isolation:** Verify User $A$ cannot read, write, or query User $B$'s collections (`users/{uidB}/*`).
3. **Audit Log Immutability:** Verify audit logs can be created by authenticated users but cannot be updated or deleted.

---

## 4. Tier 3: Offline & PWA Synchronization Tests

1. **Offline Creation:**
   * Disconnect network in browser.
   * Record expense and project obligation.
   * Verify document persists in IndexedDB and UI updates immediately.
   * Reconnect network $\rightarrow$ verify background sync without duplicate entries.
2. **Pull-to-Refresh Gesture:**
   * Verify gesture triggers only at `scrollTop === 0`.
   * Verify drag threshold of 70px.
   * Verify absence of horizontal edge-swipe interference on iOS Safari.
3. **OAuth Redirect Resilience:**
   * Test redirect sign-in flow on standalone iOS PWA.
   * Verify return to original internal route post-authentication.

---

## 5. Device Verification Matrix

| Device / Form Factor | Browser / Context | Target Widths | Acceptance Gate |
| :--- | :--- | :--- | :--- |
| **iPhone 14 / 15** | Safari Mobile | 390px | Safe area, 0 horizontal overflow, gesture smooth |
| **iPhone Pro Max** | Safari Mobile | 430px | High density layouts, card grid alignment |
| **iPhone (iOS 16.4+)** | Standalone PWA | 390px / 430px | Offline launch, pull-to-refresh, status bar color |
| **Android Pixel / Galaxy** | Chrome Mobile | 360px / 412px | Install prompt, back button hardware support |
| **MacBook / Desktop** | Chrome / Safari | 1280px+ | Responsive container max-width, keyboard navigation |
