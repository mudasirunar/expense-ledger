# UI/UX Specification & Mobile Design System

## 1. Visual Design System & Tokens

The interface is engineered with a clean, high-density, financial-grade aesthetic prioritizing legibility, clear visual hierarchy, and fast thumb-reachability on mobile devices.

### 1.1 Color Palette & Semantic Tokens
* **Background Primary:** `#0B0F19` (Dark Theme) / `#F8FAFC` (Light Theme)
* **Surface Card:** `#111827` (Dark) / `#FFFFFF` (Light)
* **Surface Elevated:** `#1F2937` (Dark) / `#F1F5F9` (Light)
* **Border Subdued:** `#374151` (Dark) / `#E2E8F0` (Light)
* **Primary Accent (Indigo/Blue):** `#3B82F6` (Interactive buttons, active tabs, focus states)
* **Financial Inflow / Credit (Emerald):** `#10B981` (Income, cash receipts, positive cash flow)
* **Financial Outflow / Debit (Rose):** `#F43F5E` (Expenses, contractor payments, obligations)
* **Pending / Warning (Amber):** `#F59E0B` (Unallocated advances, partial payments, budget alerts)
* **Text High Contrast:** `#F9FAFB` (Dark) / `#0F172A` (Light)
* **Text Muted:** `#9CA3AF` (Dark) / `#64748B` (Light)

### 1.2 Typography
* **Font Family:** `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`
* **Numbers / Currency:** Tabular figures (`font-variant-numeric: tabular-nums;`) to guarantee aligned decimal and digit columns.

---

## 2. Mobile Layout & Screen Dimensions

* **Primary Phone Width Targets:**
  * **360px:** Small Android devices (Samsung Galaxy A-series).
  * **390px:** Standard iPhone (iPhone 12 / 13 / 14 / 15 / 16).
  * **430px:** Pro Max / Plus iPhones.
* **Layout Constraints:**
  * Zero horizontal scroll under any circumstance (`overflow-x: hidden`).
  * Tap targets have a minimum dimension of **44px × 44px**.
  * Input fields prevent iOS Safari auto-zoom on focus by enforcing a minimum font size of `16px`.
  * Proper handling of `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)`.

---

## 3. Navigation Architecture

### 3.1 Bottom Navigation Bar (Mobile)
Fixed at the bottom of the screen, floating above the home indicator bar:
1. 🏠 **Dashboard:** Consolidated financial position and quick metrics.
2. 🏗️ **Projects:** Active projects list, budget health, project ledgers.
3. ➕ **Quick Add (Center Action Button):** Floating elevated action button opening a fast-entry modal (Expense, Purchase Obligation, Payment, Income, Transfer).
4. 👥 **Contacts:** Subcontractors, suppliers, workers, and clients.
5. 💳 **Accounts:** Cash on hand, bank accounts, and mobile wallets.

### 3.2 Top App Bar
* **Left:** App Title / Current View context.
* **Right:** Sync status badge (Green/Amber/Red) + Search icon + Manual refresh button.

---

## 4. Key Screen Specifications

### 4.1 Executive Dashboard
* **Header Bar:** Profile avatar, active filter selector (All / Personal / Specific Project), Timeframe dropdown.
* **Hero Financial Position Card:** Net Cash Flow, Total Inflow, Total Outflow.
* **Liquidity Strip:** Horizontal swipeable cards for Cash, Bank, and Mobile Wallet balances.
* **Payables & Receivables Summary:**
  * Total Payable (Owed to suppliers/contractors) with 1-tap drill down.
  * Total Receivable (Owed by clients) with 1-tap drill down.
* **Active Projects Carousel:** Mini cards showing Name, Progress bar (Spent vs Budget), and remaining funds.
* **Recent Activity Feed:** Grouped by date (Today, Yesterday, Earlier this week).

### 4.2 Obligation & Payment Entry Form (Modal / Bottom Sheet)
* **Dynamic Mode Selector:**
  * `Standard Expense` (Personal or immediate project petty cash).
  * `Material Purchase / Contract` (Creates an Obligation).
  * `Payment Disbursement` (Settles an existing obligation or records an advance).
* **Numeric Keypad UX:** Large currency input field with auto-formatting (`PKR 0.00`).
* **Payee / Supplier Auto-Suggest:** Quick-picker displaying recent contacts and roles.
* **Payment Allocation Widget:** When paying a contact with open bills, lists unpaid obligations with checkboxes and "Auto-Allocate" toggle.

### 4.3 Contact Master Profile Screen
* **Header Profile:** Name, company, phone (with 1-tap dial/WhatsApp link), assigned roles.
* **Financial Summary Grid:**
  * Total Paid To Contact
  * Total Received From Contact
  * Net Outstanding (Payable / Receivable)
* **Latest Payment Highlight Box:**
  * Prominent card displaying the single most recent outgoing payment (Amount, Date, Project, Account, Reference).
* **Project Breakdown Accordion:** zubair's work on Project A vs Project B.
* **Chronological Ledger Feed:** Every bill, payment, and receipt with status tags (`PAID`, `PARTIAL`, `UNPAID`).

---

## 5. State Handling (Loading, Empty, Error, Offline)

* **Loading:** Content-matched shimmer/skeleton screens (no full-page jarring spinners).
* **Empty States:** Encouraging illustrations with clear call-to-action buttons (e.g., *"No projects yet. Create your first project to start tracking expenses."*).
* **Error States:** Graceful inline error banners with retry triggers.
* **Offline Notice:** Non-intrusive status pill in the navigation header indicating cached data view and enqueued writes.
