# Project Roadmap & Task Tracker

## 1. Project Phases & Status Overview

| Phase | Description | Status | Acceptance Gate |
| :--- | :--- | :--- | :--- |
| **Phase 0** | Comprehensive Documentation Suite | **Completed** | All 13 docs + Master Prompt reviewed |
| **Phase 1** | React, TypeScript & PWA Foundation Scaffold | **In Progress** | Zero TS errors, PWA manifest, SW cache, Pull-to-refresh |
| **Phase 2** | Domain Foundation & Accounting Engine | Pending | 100% pass on accounting invariant unit tests |
| **Phase 3** | Firestore Repositories & Security Rules | Pending | Rules emulator test pass, persistent cache verified |
| **Phase 4** | Core Features (Projects, Contacts, Accounts, Ledger) | Pending | Multi-project isolation & partial payment UI verified |
| **Phase 5** | Dashboard, Search, Budgets, Reports & CSV Export | Pending | Reconciled charts, normalized search, CSV download |
| **Phase 6** | Offline Hardening, iOS PWA & Vercel Release | Pending | iPhone Safari & installed PWA verification |
| **Phase 7** | A11y, Performance Audit, Security & Final Handoff | Pending | WCAG AA compliance, Lighthouse score > 90 |

---

## 2. Detailed Task Breakdown

### Phase 0: Documentation & Architectural Blueprint
- [x] Initial brief analysis and architectural response.
- [x] Create `docs/README.md`
- [x] Create `docs/PRD.md`
- [x] Create `docs/ARCHITECTURE.md`
- [x] Create `docs/DATA_MODEL.md`
- [x] Create `docs/ACCOUNTING_RULES.md`
- [x] Create `docs/OFFLINE_PWA_SYNC.md`
- [x] Create `docs/AUTH_SECURITY.md`
- [x] Create `docs/UX_UI_SPEC.md`
- [x] Create `docs/AI_READINESS.md`
- [x] Create `docs/TEST_PLAN.md`
- [x] Create `docs/ROADMAP_TASK_TRACKER.md`
- [x] Create `docs/DECISIONS_AND_OPEN_QUESTIONS.md`
- [x] Create `docs/FIREBASE_VERCEL_SETUP.md`
- [x] Create root `MASTER_AGENT_PROMPT.md`

### Phase 1: React / TypeScript / Vite / PWA Foundation
- [ ] Initialize Vite + React + TypeScript configuration.
- [ ] Configure `tsconfig.json` with strict mode enabled.
- [ ] Setup Tailwind CSS and mobile-first CSS design tokens.
- [ ] Implement mobile app shell (`MobileAppLayout`) with safe-area support.
- [ ] Implement responsive bottom navigation bar and accessible top bar.
- [ ] Configure `manifest.webmanifest` and static PWA icons.
- [ ] Register Service Worker with offline caching fallback.
- [ ] Build custom gesture-driven Pull-to-Refresh with accessible alternative button.
- [ ] Setup `.env.example` with typed Firebase environment boundary.
- [ ] Setup Firestore multi-tab persistent cache initialization module.
- [ ] Setup Vitest testing environment and verify test runner.

### Phase 2: Domain Foundation & Accounting Engine
- [ ] Implement `Money` value object (integer minor units, formatting, arithmetic).
- [ ] Implement Domain Entities (`Transaction`, `Obligation`, `Payment`, `Allocation`, `Project`, `Contact`, `Account`).
- [ ] Implement `AllocationEngine` (1-to-many, many-to-1, unallocated advances).
- [ ] Implement `BalanceEngine` (deterministic balance derivation from ledger events).
- [ ] Implement Use Cases (`RecordExpense`, `RecordIncome`, `CreatePurchaseObligation`, `RecordOutgoingPayment`, `AllocatePayment`, `CreateTransfer`, `VoidTransaction`).
- [ ] Author comprehensive Vitest test suite for accounting invariants.

### Phase 3: Firestore Repositories & Security Rules
- [ ] Define typed Repository Interfaces in `src/data/repositories/interfaces/`.
- [ ] Implement Firestore concrete repositories in `src/data/repositories/firestore/`.
- [ ] Implement client-side idempotency keys and retry handling.
- [ ] Author `firestore.rules` enforcing user-scoping (`users/{uid}`).
- [ ] Setup Firebase emulator test suite for security rules.

### Phase 4: Core Features Implementation
- [ ] Implement Firebase Authentication context with Google provider (popup + redirect).
- [ ] Build Project Management module (create, list, detail, budget tracking).
- [ ] Build Contact Directory (create, multiple roles, master profile, project breakdown).
- [ ] Build Accounts & Inter-Account Transfer module.
- [ ] Build Obligation & Payment Entry modal (purchases, staged payments, advances).
- [ ] Build Instant Latest Payment lookup widget.

### Phase 5: Dashboard, Search, Budgets & Reports
- [ ] Build Executive Dashboard with dynamic time horizons and project filters.
- [ ] Build normalized in-memory search across all financial entities.
- [ ] Build Budget engine with visual warning thresholds (80%, 90%, 100%).
- [ ] Build Financial Reports (P&L, Cash Flow, Project Cost Comparisons).
- [ ] Build CSV Export for transactions, projects, and contact ledgers.
- [ ] Build JSON backup export and validated restore preview.

### Phase 6: Offline Hardening & Deployment
- [ ] Verify offline persistence in airplane mode.
- [ ] Verify pending synchronization badge and background write replay.
- [ ] Test Google OAuth redirect on actual iPhone Safari and installed PWA.
- [ ] Configure Vercel build settings and deploy to staging domain.

### Phase 7: Accessibility, Quality & Final Handoff
- [ ] WCAG 2.1 AA contrast and screen-reader accessibility review.
- [ ] Performance audit (Lighthouse PWA, Best Practices, Performance).
- [ ] Security review of build artifacts.
- [ ] Final handoff and completion summary.
