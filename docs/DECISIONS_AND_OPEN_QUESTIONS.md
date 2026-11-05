# Architectural Decisions Log & Open Questions

## 1. Confirmed Architectural Decisions

| ID | Topic | Decision | Rationale |
| :--- | :--- | :--- | :--- |
| **ADR-001** | Money Representation | **Integer Minor Units (Paisa / Cents)** | Floating point arithmetic in JavaScript causes catastrophic rounding errors (e.g. `0.1 + 0.2 !== 0.3`). Minor units guarantee 100% precision. |
| **ADR-002** | Backend Strategy | **Serverless Frontend-Only (No Custom Backend)** | Uses Firebase Auth + Cloud Firestore + Vercel directly. Keeps operational overhead at zero, stays within free-tier quotas, and eliminates server maintenance. |
| **ADR-003** | Obligation vs Payment | **Accrual Expense Recognition** | An obligation records the expense and liability. A payment settles the liability. Payments never duplicate expenses. |
| **ADR-004** | Internal Transfers | **P&L-Neutral Inter-Account Transfers** | Transfers between Cash, Bank, and Wallets are liquidity movements, not income or expenses. |
| **ADR-005** | Offline Persistence | **Firestore Multi-Tab Persistent Cache** | Firestore's built-in IndexedDB persistence allows instant optimistic local writes and handles sync without complex manual caching layers. |
| **ADR-006** | Historical Deletion | **Immutable Audit & Voids (No Physical Deletes)** | Financial records are never silently erased. Corrections use void flags or reversing transactions with audit logs. |
| **ADR-007** | Git Policy | **Explicit Owner-Authorization Only** | Zero Git commands or operations are performed unless explicitly instructed by the owner. |

---

## 2. Technical Limitations & Trade-Offs

1. **No Cloud Functions / Server-Side Financial Invariants:**
   * *Limitation:* Without Cloud Functions or a custom backend, complex relational invariants across multiple collections (e.g. ensuring an allocation sum exactly equals a payment) cannot be strictly enforced by Firestore Security Rules.
   * *Mitigation:* The client-side domain layer enforces all invariants, and users have single-tenant isolation (`users/{uid}/*`).
2. **Offline Firestore Search Boundedness:**
   * *Limitation:* Firestore cannot perform full-text or range queries offline across documents that have never been downloaded to the local device cache.
   * *Mitigation:* The UI clearly indicates when search is running in "Cached Records Only" mode.
3. **iOS Safari Storage Eviction:**
   * *Limitation:* iOS Safari may evict IndexedDB data after periods of device inactivity or storage pressure.
   * *Mitigation:* The app provides 1-tap JSON and CSV export/backup to local files or cloud drives.
4. **Push Notifications Without Server:**
   * *Limitation:* Closed-app push notifications require a backend push server and Apple APNs keys, which are outside a frontend-only architecture.
   * *Mitigation:* In-app badges, budget banners, and overdue payment notifications are surfaced dynamically when the app is opened.

---

## 3. Assumptions & Open Inquiries for Project Owner

1. **Default Currency Formatting:**
   * *Assumption:* Defaults to Pakistani Rupee (`PKR`) with comma formatting (`PKR 150,000.00`).
   * *Status:* Awaiting owner confirmation if alternate formatting is preferred.
2. **Multi-Currency Support:**
   * *Assumption:* Version 1 is strictly single-currency (all accounts and projects share the same base currency) to avoid complex exchange rate recalculations.
3. **Export Formats:**
   * *Assumption:* CSV export is standard for Excel/Sheets; JSON export includes full schema metadata for backup/restore.
