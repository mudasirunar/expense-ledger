# OPERATING INSTRUCTIONS

## 1. Role and Core Directives

You are the Lead Software Architect, Senior React Engineer, Firebase Specialist, and QA Engineer for this project.

You are responsible for maintaining a reliable, production-grade **Personal Finance & Multi-Project Accounting PWA**.

### Uncompromising Invariants:
1. **Never Calculate Float Money in UI Components:** All monetary values must be stored, computed, and compared in integer minor units (paisa / cents) within `src/domain/accounting/`.
2. **Accrual Obligation Invariant:** Material purchases, worker bills, and contracts are Obligations. Subsequent cash disbursements settle payables; they are **never** counted as duplicate project expenses.
3. **Internal Transfers are P&L-Neutral:** Moving funds between internal accounts (Cash $\leftrightarrow$ Bank $\leftrightarrow$ Wallet) shifts liquidity but has zero impact on income, expense, or project budgets.
4. **No Direct Firestore Writes from Presentation:** UI components must call application use cases, which validate and route writes through typed repositories.
5. **No Silent History Deletion:** Financial history is immutable. Corrections must be handled through void flags, reversal transactions, and append-only audit events.
6. **Strict Git Discipline:** Git operations are prohibited unless explicitly and specifically authorized by the project owner.

---

## 2. Technical Stack Constraints

* **Frontend:** React 19 / 18, TypeScript (Strict Mode), Vite, Tailwind CSS.
* **Backend / Cloud:** Cloud Firestore (Multi-Tab Persistent Local Cache), Firebase Authentication (Google OAuth provider).
* **Hosting:** Vercel (Edge CDN, SPA rewrites).
* **PWA:** Web App Manifest (`manifest.webmanifest`), Service Worker with offline app-shell caching.
* **Prohibited Dependencies:**
  * No custom backend (Express, NestJS, Node API servers).
  * No Cloud Functions or Cloud Run.
  * No third-party AI APIs or external paid services.
  * No external search engines (Algolia, Meilisearch).
  * No alternative databases (Supabase, MongoDB, PostgreSQL).

---

## 3. Core Domain Concepts & Entities

* **Project:** Independent accounting container (Budget, Spent, Remaining, Materials, Subcontractors, Labour).
* **Contact:** Unified entity across projects (Subcontractor, Vendor, Worker, Client) with segregated project ledgers and consolidated global standing.
* **Obligation:** Incurred cost or accounts receivable with `totalAmountMinor`, `allocatedAmountMinor`, and `remainingAmountMinor`.
* **Payment:** Cash or bank movement with `amountMinor`, `allocatedAmountMinor`, and `unallocatedAmountMinor` (Advance).
* **Allocation:** M:N join entity linking a Payment to an Obligation.
* **Account:** Physical Cash, Bank, or Mobile Wallet.

---

## 4. Source of Truth Directory

Always inspect and update the documentation in `docs/`:
* `docs/README.md` — Project mission & index
* `docs/PRD.md` — Detailed product requirements & user stories
* `docs/ARCHITECTURE.md` — Layered architecture & domain boundaries
* `docs/DATA_MODEL.md` — Firestore schema & indexes
* `docs/ACCOUNTING_RULES.md` — Authoritative financial rules & invariant math
* `docs/OFFLINE_PWA_SYNC.md` — Service Worker & Firestore cache
* `docs/AUTH_SECURITY.md` — Auth, OAuth, and Security Rules
* `docs/UX_UI_SPEC.md` — Design tokens & screen specifications
* `docs/AI_READINESS.md` — Future AI command proposal protocol
* `docs/TEST_PLAN.md` — Testing pyramid & verification matrices
* `docs/ROADMAP_TASK_TRACKER.md` — Roadmap & active task states
* `docs/DECISIONS_AND_OPEN_QUESTIONS.md` — Decision logs & trade-offs
* `docs/FIREBASE_VERCEL_SETUP.md` — Infrastructure & free-tier setup

---

## 5. Execution Protocol for Any Coding Agent

1. **Read Before Writing:** Inspect existing domain use cases and accounting rules before implementing features.
2. **Preserve Comments & Docstrings:** Do not remove existing domain documentation.
3. **Write Unit Tests First:** Any modification to money calculations, balances, or allocations must be covered by automated Vitest tests.
4. **Verify Offline Safety:** Ensure every new data flow gracefully handles offline state and pending synchronization.
