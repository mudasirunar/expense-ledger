# UI/UX Specification & Apple Liquid Glass (Glisse) Design System

## 1. Visual Design System & Apple Liquid Glass (Glisse)

The interface strictly adopts Apple's **Liquid Glass** aesthetic via the **Glisse** component framework (`glisse` library by Kelvin Zhang), combined with Tailwind CSS tokens. The application must look, behave, and feel like an official native iOS 18 / visionOS application.

### 1.1 Apple Liquid Glass (Glisse) Core UI Standards
* **Glisse Everywhere:** All primary interactive controls and surfaces must utilize Glisse components or Glisse liquid glass styling:
  * **Bottom Navigation Bar:** Floating translucent glass dock hovering over scrollable content with real-time backdrop blur.
  * **Top App Bar:** Liquid frosted glass header with dynamic optical refraction as content scrolls underneath.
  * **Interactive Controls:** Glisse buttons, switches, sliders, segmented controls, and dropdowns.
  * **Data Cards:** Translucent glass container cards with specular border highlights and inner glow.
  * **Forms & Text Inputs:** Glass-backed input fields with high-contrast text and subtle refractive focus rings.
  * **Modals & Drawers:** Frosted bottom sheets with layered background blur.

### 1.2 Color Palette & Semantic Tokens
* **Dark Obsidian Glass Mode:**
  * Background: `#0B0F19` with subtle ambient radial gradients.
  * Glass Surface: `rgba(17, 24, 39, 0.75)` with `backdrop-blur-xl`.
  * Glass Border: `rgba(255, 255, 255, 0.08)` with subtle 1px specular edge.
  * Text: `#F9FAFB` (high contrast), `#9CA3AF` (muted).
* **Light Crystal Glass Mode:**
  * Background: `#F8FAFC`.
  * Glass Surface: `rgba(255, 255, 255, 0.8)` with `backdrop-blur-xl`.
  * Glass Border: `rgba(0, 0, 0, 0.06)` with subtle specular highlight.
  * Text: `#0F172A` (high contrast), `#64748B` (muted).
* **Financial Semantic Accents:**
  * Inflows / Credits: `#10B981` (Emerald)
  * Outflows / Debits: `#F43F5E` (Rose)
  * Warnings / Advances: `#F59E0B` (Amber)
  * System / Actions: `#3B82F6` (Electric Blue)

### 1.3 Zero-Flicker Persistent Theme Architecture (FOIT Prevention)
To prevent the jarring "Flash of Dark Mode" or "Flash of Light Mode" when a user reloads the app:
1. **Persistent Storage:** Active theme (`'light' | 'dark' | 'system'`) is persisted in `localStorage` under key `expense_ledger_theme`.
2. **Synchronous Head Script:** A blocking inline script in `<head>` of `index.html` executes **before React mounts and before DOM paints**:
   ```javascript
   (function() {
     try {
       const saved = localStorage.getItem('expense_ledger_theme');
       const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
       const isDark = saved === 'dark' || (!saved && prefersDark);
       if (isDark) {
         document.documentElement.classList.add('dark');
       } else {
         document.documentElement.classList.remove('dark');
       }
     } catch (e) {}
   })();
   ```
3. **No Flashing Guarantee:** By evaluating theme state synchronously before first paint, the browser renders the exact user-selected theme with zero flicker on page refresh or launch.

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
