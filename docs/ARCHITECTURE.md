# System Architecture

## 1. Architectural Principles

The application is structured following Clean Architecture and Domain-Driven Design (DDD) principles adapted for a modern, serverless React PWA:

1. **Domain Isolation:** Core financial calculations, accounting invariants, money representation, and validation live in pure TypeScript modules (`src/domain/`) with **zero dependencies** on React, Firebase, or the browser DOM.
2. **Repository Pattern:** All persistence operations are defined via typed repository interfaces (`src/data/repositories/interfaces/`). The Firebase Firestore implementation (`src/data/repositories/firestore/`) is merely one infrastructure adapter.
3. **Unidirectional Data Flow:** Data flows from Firestore repositories through application use cases into React hooks and UI components. UI components never mutate Firestore documents directly.
4. **Offline by Default:** All repository operations leverage Firestore's local persistent cache. UI components render optimistic states and monitor sync metadata.

---

## 2. Layered Architecture Diagram

```
+-------------------------------------------------------------+
|                        Presentation                         |
|   (React 19/18, Tailwind CSS, Mobile Navigation, Pull-to-R) |
+------------------------------+------------------------------+
                               | calls
+------------------------------v------------------------------+
|                      Application Hooks                      |
|       (useDashboard, useTransactions, useProjects, etc.)     |
+------------------------------+------------------------------+
                               | executes
+------------------------------v------------------------------+
|                     Application Use Cases                   |
|   (RecordExpense, AllocatePayment, CreateTransfer, etc.)    |
+------------------------------+------------------------------+
                               | orchestrates & validates
+------------------------------v------------------------------+
|                      Domain Engine (DDD)                    |
|   (Money, AllocationEngine, BalanceDerivation, Entities)     |
+------------------------------+------------------------------+
                               | persists via
+------------------------------v------------------------------+
|                 Repository Interfaces (Contracts)            |
|       (ITransactionRepository, IProjectRepository, etc.)    |
+------------------------------+------------------------------+
                               | implemented by
+------------------------------v------------------------------+
|                   Infrastructure Adapter                    |
|        (Cloud Firestore Persistent Cache, Firebase Auth)    |
+-------------------------------------------------------------+
```

---

## 3. Directory Layout and Responsibilities

```
src/
├── app/                        # Application bootstrap
│   ├── layouts/                # MobileAppLayout (with safe-areas, bottom nav)
│   ├── router/                 # Route guards, code-split lazy routes
│   └── providers/              # AuthProvider, SyncProvider, ThemeProvider
├── domain/                     # Authoritative business logic
│   ├── accounting/             # Integer Money, allocation algorithms, ledger derivation
│   ├── entities/               # Immutable domain entities & type definitions
│   └── usecases/               # Command-driven application actions
├── data/                       # Infrastructure & Data Layer
│   ├── firebase/               # Firebase app, Auth, Firestore cache setup
│   └── repositories/
│       ├── interfaces/         # Repository contracts
│       └── firestore/          # Concrete Firestore implementations
├── features/                   # User-facing modules (UI + local controllers)
│   ├── dashboard/              # Metrics, charts, time filters
│   ├── transactions/           # Add/Edit expenses, incomes, obligations
│   ├── projects/               # Projects list, details, budget tracking
│   ├── contacts/               # Contact directory, role ledgers, payment lookup
│   ├── accounts/               # Account cards, balances, transfers
│   ├── search/                 # Normalized in-memory search
│   └── reports/                # Balance sheets, profit/loss, CSV export
├── components/                 # Atomic UI primitives (accessible, mobile-first)
├── hooks/                      # Global UI hooks (usePullToRefresh, useNetwork)
├── styles/                     # CSS custom properties, tokens, reset
└── utils/                      # Formatting (currency, date), UUIDs, validators
```

---

## 4. State Management Strategy

To ensure high performance on mobile devices without unnecessary re-renders:
* **Server/Cache State:** Firestore real-time listeners (`onSnapshot`) wrapped inside typed custom hooks provide real-time updates while reading directly from IndexedDB when offline.
* **UI State:** React Context is restricted to global operational states:
  * `AuthContext`: Current Firebase user, authentication status, route redirection.
  * `SyncContext`: Online/offline status, pending write count, last sync timestamp.
  * `ThemeContext`: Dark/light mode preference and mobile safe-area insets.
* **Feature State:** Managed via standard React hooks (`useState`, `useReducer`, `useMemo`) close to the consuming components.

---

## 5. Offline Data Pipeline

1. **Write Request:** User enters a payment or purchase in the UI.
2. **Domain Validation:** Use case validates inputs, computes minor currency units, assigns a client-generated UUID and idempotency key.
3. **Optimistic Local Persistence:** Repository writes to Firestore SDK via `setDoc`. Firestore immediately writes to its local IndexedDB persistent cache and updates local snapshot listeners.
4. **UI Update:** The UI updates immediately (zero latency) with a "Pending Sync" indicator if offline.
5. **Background Sync:** Once connectivity is restored, the Firestore SDK seamlessly transmits the pending write to Cloud Firestore.
6. **Conflict Resolution:** Last-write-wins based on server timestamp, while domain idempotency keys prevent duplicate payments.

---

## 6. Future Extensibility & Modularity

* **Decoupled Backend:** By adhering to repository interfaces, Cloud Firestore could be replaced or supplemented in the future without changing a single React component or domain use case.
* **AI Readiness:** The use-case layer exposes typed command interfaces that an AI assistant can invoke with preview and user confirmation (detailed in `docs/AI_READINESS.md`).
