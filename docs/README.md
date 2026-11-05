# Personal Finance & Multi-Project Accounting PWA

> **A reliable, mobile-first, installable Progressive Web Application for managing personal daily finances alongside multiple construction and business project accounts with accrual-grade financial correctness.**

---

## 1. Project Overview

This repository houses the frontend source code and architecture documentation for the **Personal Finance & Multi-Project Accounting PWA**.

The product solves a common real-world problem for builders, entrepreneurs, and independent professionals: managing daily personal cash flow while simultaneously operating multiple active commercial, residential, or business projects—without mixing personal funds with project capital, and without losing track of contractor obligations, material purchases, worker wages, and client receivables.

### Core Value Propositions
* **Strict Separation of Concerns:** Personal daily expenses and income remain isolated from project financial ledgers, while offering an optional consolidated executive dashboard.
* **Accrual-Grade Obligation Engine:** Purchases and contract agreements are tracked as obligations (costs). Subsequent partial payments or advance allocations settle payables without double-counting expenses.
* **Unified Contact Entity Across Projects:** A contractor, vendor, or client can participate across multiple projects with isolated project balances, while their master contact card aggregates total payments, receipts, payables, and receivables.
* **Mobile-First Experience:** Specifically engineered for 360–430px mobile screens (iPhone Safari and iOS Home Screen PWA first, Android Chrome second, desktop responsive).
* **Pure Frontend Serverless Architecture:** Built strictly with React, TypeScript, Vite, Cloud Firestore, and Firebase Authentication, deployed on Vercel. Zero custom backend, zero Cloud Functions, and zero paid third-party dependencies.
* **Offline-First Resilience:** Functional offline through Service Worker app-shell caching, Firestore IndexedDB multi-tab persistent cache, optimistic updates, and manual pull-to-refresh.

---

## 2. Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **UI Framework** | React 19 / 18 | Declarative component UI |
| **Language** | TypeScript (Strict Mode) | Type safety and domain boundary enforcement |
| **Build Tool** | Vite | Fast HMR, optimized production asset bundling |
| **Styling** | Tailwind CSS & Modern CSS Tokens | Mobile-first utility design, safe-area inset support |
| **Database** | Cloud Firestore | Client-side persistent document store with IndexedDB cache |
| **Authentication** | Firebase Authentication | Google OAuth provider (popup + redirect flows) |
| **PWA Engine** | Web App Manifest & Service Worker | Installability, offline app shell, background caching |
| **Hosting** | Vercel | Global edge CDN frontend hosting |
| **Testing** | Vitest + Testing Library | Domain accounting unit tests and component tests |

---

## 3. Documentation Directory Index

The documentation in `docs/` is the authoritative, permanent source of truth for this project. Any future developer or AI agent must consult these documents before modifying the codebase:

1. [`docs/README.md`](file:///Users/apple/WorkSpace/Projects/Haris-Ledger-Project/docs/README.md) — (This file) Project overview, stack, document index, and governance.
2. [`docs/PRD.md`](file:///Users/apple/WorkSpace/Projects/Haris-Ledger-Project/docs/PRD.md) — Product Requirements Document: workflows, user stories, functional modules, and acceptance criteria.
3. [`docs/ARCHITECTURE.md`](file:///Users/apple/WorkSpace/Projects/Haris-Ledger-Project/docs/ARCHITECTURE.md) — Layered software architecture: domain engine, use cases, repository pattern, and state management.
4. [`docs/DATA_MODEL.md`](file:///Users/apple/WorkSpace/Projects/Haris-Ledger-Project/docs/DATA_MODEL.md) — Cloud Firestore schema, document paths (`users/{uid}/*`), indexes, and normalization.
5. [`docs/ACCOUNTING_RULES.md`](file:///Users/apple/WorkSpace/Projects/Haris-Ledger-Project/docs/ACCOUNTING_RULES.md) — Authoritative accounting principles: integer minor units, obligations vs payments, allocations, advances, and reversals.
6. [`docs/OFFLINE_PWA_SYNC.md`](file:///Users/apple/WorkSpace/Projects/Haris-Ledger-Project/docs/OFFLINE_PWA_SYNC.md) — Service Worker strategies, Firestore IndexedDB offline capabilities, sync indicators, and pull-to-refresh.
7. [`docs/AUTH_SECURITY.md`](file:///Users/apple/WorkSpace/Projects/Haris-Ledger-Project/docs/AUTH_SECURITY.md) — Firebase Auth Google sign-in on Vercel, route restoration, and strict Firestore Security Rules.
8. [`docs/UX_UI_SPEC.md`](file:///Users/apple/WorkSpace/Projects/Haris-Ledger-Project/docs/UX_UI_SPEC.md) — Mobile-first visual design system, layout constraints, color palettes, typography, and screen states.
9. [`docs/AI_READINESS.md`](file:///Users/apple/WorkSpace/Projects/Haris-Ledger-Project/docs/AI_READINESS.md) — Architectural contract for future voice/text AI integration (proposal/preview/approval pattern).
10. [`docs/TEST_PLAN.md`](file:///Users/apple/WorkSpace/Projects/Haris-Ledger-Project/docs/TEST_PLAN.md) — Testing strategy: accounting invariant unit tests, repository mocks, emulator tests, and manual matrices.
11. [`docs/ROADMAP_TASK_TRACKER.md`](file:///Users/apple/WorkSpace/Projects/Haris-Ledger-Project/docs/ROADMAP_TASK_TRACKER.md) — Phase-by-phase implementation progress, acceptance gates, and status.
12. [`docs/DECISIONS_AND_OPEN_QUESTIONS.md`](file:///Users/apple/WorkSpace/Projects/Haris-Ledger-Project/docs/DECISIONS_AND_OPEN_QUESTIONS.md) — Architectural decision log, rationale, trade-offs, and open inquiries.
13. [`docs/FIREBASE_VERCEL_SETUP.md`](file:///Users/apple/WorkSpace/Projects/Haris-Ledger-Project/docs/FIREBASE_VERCEL_SETUP.md) — Environment variables, Google Cloud OAuth domain whitelisting, and free-tier cost discipline.
14. [`MASTER_AGENT_PROMPT.md`](file:///Users/apple/WorkSpace/Projects/Haris-Ledger-Project/MASTER_AGENT_PROMPT.md) — Root operating instructions and rules of engagement for coding agents.

---

## 4. Source-of-Truth Rules & Development Invariants

1. **Never Calculate Float Money in React Components:** All mathematical calculations, balance derivations, and allocations must execute within `src/domain/accounting/` using integer minor currency units.
2. **Strict User Scoping:** All user data in Cloud Firestore lives strictly under `users/{uid}/*`. No global or shared root collections.
3. **No Hidden Deletions:** Financial history is preserved through void transactions or reversal events.
4. **Git Operations:** Git operations are strictly prohibited unless authorized explicitly by the project owner.
