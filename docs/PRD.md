# Product Requirements Document (PRD)

## 1. Product Vision & Goals

The **Personal Finance & Multi-Project Accounting PWA** is an installable, mobile-first financial management platform designed for users who operate multiple business or construction projects while simultaneously tracking personal daily income and expenses.

The application bridges the gap between basic personal budgeting apps (which lack multi-project ledgers, material inventories, and subcontractor accounts) and heavy enterprise ERPs (which are complex, expensive, desktop-only, and require server infrastructure).

---

## 2. Target Persona & Devices

### 2.1 Target Persona
* **Owner/Builder/Independent Professional:** Manages daily personal living expenses while simultaneously running 4+ active projects (e.g., building a residential house, developing a commercial shop, running a retail business).
* **Key Pain Points:**
  * Paying a contractor PKR 50,000 against a PKR 200,000 contract and accidentally double-counting the total contract as an expense alongside the payment.
  * Buying 100 bags of cement on credit and losing track of how much is owed to the supplier.
  * Forgetting the date, project, and amount of the last payment made to a specific mason or subcontractor.
  * Mixing personal grocery expenses with construction material purchases.
  * Spotty network connectivity on construction sites causing failed data entry or duplicate transactions.

### 2.2 Device & Browser Priority
1. **Tier 1 (Primary):** iPhone Safari (iOS 16.4+) & iOS Home Screen Installed PWA.
2. **Tier 2:** Android Chrome & Android Installed PWA.
3. **Tier 3:** Desktop Modern Browsers (Chrome, Safari, Edge, Firefox).

*Viewport Target:* 360px – 430px width phone screens (tested at 360px, 390px, and 430px).

---

## 3. Core Functional Requirements

### 3.1 Executive Dashboard
* **Dynamic Time Horizons:**
  * Today, Yesterday, This Week, This Month, Previous Month, This Quarter, This Year, Previous Year, Custom Date Range.
* **Filter Contexts:**
  * Combined Overview (All Projects + Personal).
  * Personal Finances Only.
  * Single Project Focus (e.g., "House Construction").
  * Multi-Project Selection (e.g., "House Construction" + "Shop Construction").
* **Key Metrics Displayed:**
  * Inflows: Total Income (Personal vs. Project).
  * Outflows: Total Expenses (Personal vs. Project Obligations).
  * Net Cash Flow (Income - Actual Cash Outflow).
  * Account Balances: Breakdown of Cash on Hand, Bank Accounts, Mobile Wallets.
  * Total Outstanding Payables (Money owed to suppliers, contractors, workers).
  * Total Outstanding Receivables (Money owed by clients, customers, tenants).
  * Project Summary Cards: Budget, Spent, Remaining, % Utilization, Status.
  * Visual Analytics: Income vs. Expense trends, Category Spending donut charts, Monthly spending trajectory.
  * Recent Transactions stream with instant drill-down.
  * Sync & Network Status Badge (Online, Offline, Pending Writes Count).

### 3.2 Personal Finance Engine
* Instant recording of daily Expenses, Income, and Refunds.
* Categorization (Groceries, Utilities, Healthcare, Fuel, Dining, Shopping, Education, etc.).
* Account association (Paid via Cash, Bank, Mobile Wallet).
* Notes, date, time, and optional payee contact.
* Strict partition: Personal financial transactions never pollute project cost accounts.

### 3.3 Multi-Project Accounting Engine
* Support for 4+ active projects simultaneously, with unlimited total projects.
* **Project Metadata:** Name, Project Code, Client/Owner, Location, Budget, Start Date, Target Completion Date, Actual Completion Date, Status (Planned, Active, On Hold, Completed, Archived).
* **Cost Classification:**
  * **Material Purchases:** Item name, quantity, unit (bags, tons, feet, sqft, pieces), unit price, total amount, supplier, payment status (Unpaid, Partially Paid, Fully Paid).
  * **Contractor Contracts & Billing:** Lump-sum or milestone-based contracts, variation orders, running bills.
  * **Labour & Worker Wages:** Daily wages, weekly payroll, piece-rate labour.
  * **Other Project Overheads:** Machinery rental, municipal permits, cartage/transportation, utility connections.
* **Independent Ledgers:** Every project has its own isolated income, expenses, obligations, payables, receivables, and profit/loss reports.

### 3.4 Contact Management & Master Ledger
* Single reusable contact entity representing Customers, Clients, Contractors, Workers, Labourers, Suppliers, and Vendors.
* A single contact can have multiple roles across different projects (e.g., "Ali" is a supplier for Project 1 and a contractor for Project 2).
* **Contact Card Summary:**
  * Contact info: Name, Company, Phone, Email, Roles, Notes.
  * Financial overview across all projects: Total Paid, Total Received, Net Payable, Net Receivable.
  * **Latest Outgoing Payment:** Exact amount, date, time, project, account, description.
  * **Latest Incoming Receipt:** Exact amount, date, time, project, account, description.
  * Complete timeline history of all contracts, purchases, payments, and receipts.

### 3.5 Obligations, Partial Payments & Advances (Accrual Engine)
* **Obligation Creation:** When goods or services are delivered, an Obligation record is created with `totalAmount`.
* **Settlement Workflows:**
  * **Full Payment at Inception:** Obligation created and marked Fully Paid via an attached Payment record.
  * **Partial Payment:** Obligation created for PKR 100,000, initial payment of PKR 40,000. Balance payable = PKR 60,000. Expense recognized = PKR 100,000.
  * **Subsequent Payments:** Additional payment of PKR 20,000 allocated to this obligation reduces payable to PKR 40,000. Expense remains PKR 100,000.
  * **Unallocated Advances:** Advance paid to a supplier or contractor without an initial invoice is recorded as an `Advance Payment` (Asset / Prepayment). When materials arrive, the obligation is created and the advance is allocated against it.
  * **Symmetrical Client Receivables:** Invoicing a client creates an accounts receivable. Partial payments received reduce the receivable without artificially duplicating income.

### 3.6 Accounts & Inter-Account Transfers
* Supported Accounts: Physical Cash, Bank Accounts, Mobile Wallets (e.g., Easypaisa, JazzCash, Nayapay, SadaPay).
* Account fields: Name, Type, Account Number / IBAN (optional), Initial Balance, Current Recomputed Balance.
* **Inter-Account Transfers:**
  * Moving money between internal accounts (e.g., Bank to Cash) debits one account and credits another.
  * Transfers are strictly **non-P&L transactions** (zero impact on income, expense, or project budgets).

### 3.7 Budgets & Financial Reports
* Periodic Budgets: Monthly, Quarterly, Yearly for Personal categories and Projects.
* Configurable warning thresholds (80%, 90%, 100%).
* Visual alerts when expenses approach or exceed budget limits.
* **Exporting:** Clean CSV generation for transactions, project summaries, and contact ledgers.
* Offline backup: Structured JSON export/import with pre-validation and preview before restore.

### 3.8 Global Normalized Search
* Unified search across Personal Expenses, Project Costs, Obligations, Payments, Contacts, Projects, and Accounts.
* Filters: Date range, Amount range, Transaction Type, Project, Category, Account, Contact, Status.
* In-memory normalized index for instantaneous mobile response even when offline.

---

## 4. Non-Functional Requirements

* **Performance:** App shell loads in < 1.5s on mobile 4G. Smooth 60fps animations.
* **Offline Resilience:** Reads and writes work without an active internet connection using Firestore IndexedDB cache.
* **Security:** Strict Firebase Security Rules scoped to `request.auth.uid`. Zero cross-user data leakage.
* **Accessibility:** WCAG 2.1 AA compliant. Minimum 44x44px touch targets. High contrast ratios. Screen-reader accessible labels.
