/**
 * Financial Reports Domain Engine (P&L, Cash Flow, Project Cost Comparisons)
 * Pure integer minor-unit calculations — zero floating-point money math.
 *
 * Accounting Invariants Enforced:
 * 1. Profit & Loss (Accrual Basis):
 *    - Revenue = posted `income` + `refund` transactions (excluding transfers & voided).
 *    - Expenses = posted `expense` transactions + non-voided payable `obligations`.
 *    - Outgoing `payments` settle payables and are NEVER double-counted as P&L expenses.
 *    - `transfer` transactions are strictly P&L-neutral.
 * 2. Cash Flow Statement (Cash Basis):
 *    - Cash In = posted `income` + `refund` transactions + posted incoming `payments`.
 *    - Cash Out = posted `expense` transactions + posted outgoing `payments`.
 *    - Internal `transfer` volume is tracked separately and has 0 net impact on total cash.
 * 3. Project Cost Comparisons:
 *    - Compares every non-archived project's Budget vs. Direct Expenses + Bills Incurred
 *      (for the selected period, plus total lifetime budget health).
 */

import {
  Account,
  Obligation,
  Payment,
  Project,
  Transaction,
} from '@/domain/entities';
import { BudgetAlertLevel } from './dashboardAnalytics';
import { classifyBudgetAlert, getPersonalCategoryLabel } from './budgetEngine';

export type ReportPeriod = 'month' | 'quarter' | 'year' | 'all';

export interface FinancialReportInput {
  accounts: readonly Account[];
  projects: readonly Project[];
  transactions: readonly Transaction[];
  obligations: readonly Obligation[];
  payments: readonly Payment[];
  period: ReportPeriod;
  now?: Date;
}

export interface PnLLineItem {
  readonly key: string;
  readonly label: string;
  readonly scope: 'personal' | 'project';
  readonly amountMinor: number;
  readonly sharePct: number;
  readonly count: number;
}

export interface ProfitAndLossReport {
  readonly totalIncomeMinor: number;
  readonly totalExpenseMinor: number;
  readonly directExpenseMinor: number;
  readonly billsIncurredMinor: number;
  readonly netProfitMinor: number;
  readonly profitMarginPct: number | null;
  readonly incomeLines: readonly PnLLineItem[];
  readonly expenseLines: readonly PnLLineItem[];
}

export interface AccountCashFlowRow {
  readonly accountId: string;
  readonly accountName: string;
  readonly accountType: Account['type'];
  readonly currentBalanceMinor: number;
  readonly cashInMinor: number;
  readonly cashOutMinor: number;
  readonly netChangeMinor: number;
}

export interface CashFlowReport {
  readonly totalCashInMinor: number;
  readonly totalCashOutMinor: number;
  readonly netCashFlowMinor: number;
  readonly transferVolumeMinor: number;
  readonly transferCount: number;
  readonly closingCashMinor: number;
  readonly byAccount: readonly AccountCashFlowRow[];
}

export interface ProjectCostRow {
  readonly projectId: string;
  readonly projectName: string;
  readonly status: Project['status'];
  readonly budgetMinor: number;
  readonly directExpenseMinor: number;
  readonly billsIncurredMinor: number;
  readonly totalSpentMinor: number;
  readonly incomeMinor: number;
  readonly remainingMinor: number;
  readonly utilizationPct: number;
  readonly alertLevel: BudgetAlertLevel;
}

export interface ProjectComparisonReport {
  readonly totalBudgetMinor: number;
  readonly totalSpentMinor: number;
  readonly totalDirectMinor: number;
  readonly totalBillsMinor: number;
  readonly totalRemainingMinor: number;
  readonly overallUtilizationPct: number;
  readonly rows: readonly ProjectCostRow[];
}

export interface FinancialReportBundle {
  readonly period: ReportPeriod;
  readonly periodLabel: string;
  readonly periodRangeLabel: string;
  readonly pnl: ProfitAndLossReport;
  readonly cashFlow: CashFlowReport;
  readonly projectComparison: ProjectComparisonReport;
}

function toLocalDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function normalizeDateKey(raw: string | undefined): string {
  if (!raw) return '';
  return raw.slice(0, 10);
}

export function getReportPeriodBounds(
  period: ReportPeriod,
  now: Date = new Date()
): { startKey: string | null; endKey: string | null; label: string; rangeLabel: string } {
  const year = now.getFullYear();
  const month = now.getMonth();

  if (period === 'month') {
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0);
    const monthName = start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    return {
      startKey: toLocalDateKey(start),
      endKey: toLocalDateKey(end),
      label: 'This Month',
      rangeLabel: monthName,
    };
  }

  if (period === 'quarter') {
    const qIndex = Math.floor(month / 3);
    const startMonth = qIndex * 3;
    const start = new Date(year, startMonth, 1);
    const end = new Date(year, startMonth + 3, 0);
    return {
      startKey: toLocalDateKey(start),
      endKey: toLocalDateKey(end),
      label: 'This Quarter',
      rangeLabel: `Q${qIndex + 1} ${year}`,
    };
  }

  if (period === 'year') {
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31);
    return {
      startKey: toLocalDateKey(start),
      endKey: toLocalDateKey(end),
      label: 'This Year',
      rangeLabel: `${year}`,
    };
  }

  return {
    startKey: null,
    endKey: null,
    label: 'All Time',
    rangeLabel: 'All Recorded History',
  };
}

function isWithinBounds(
  dateKey: string,
  startKey: string | null,
  endKey: string | null
): boolean {
  if (!startKey || !endKey) return true;
  if (!dateKey) return false;
  return dateKey >= startKey && dateKey <= endKey;
}

export function computeFinancialReports(input: FinancialReportInput): FinancialReportBundle {
  const {
    accounts,
    projects,
    transactions,
    obligations,
    payments,
    period,
    now = new Date(),
  } = input;

  const bounds = getReportPeriodBounds(period, now);
  const projectMap = new Map(projects.map((p) => [p.id, p]));

  // --- 1. Profit & Loss (Accrual Basis) ---
  let totalIncomeMinor = 0;
  let directExpenseMinor = 0;
  let billsIncurredMinor = 0;

  const incomeBuckets = new Map<
    string,
    { label: string; scope: 'personal' | 'project'; amountMinor: number; count: number }
  >();
  const expenseBuckets = new Map<
    string,
    { label: string; scope: 'personal' | 'project'; amountMinor: number; count: number }
  >();

  // --- 2. Cash Flow (Cash Basis) ---
  let totalCashInMinor = 0;
  let totalCashOutMinor = 0;
  let transferVolumeMinor = 0;
  let transferCount = 0;

  const activeAccounts = accounts.filter((a) => !a.isArchived && !a.isDeleted);
  const closingCashMinor = activeAccounts.reduce((s, a) => s + (a.currentBalanceMinor || 0), 0);

  const accountFlowMap = new Map<
    string,
    { cashInMinor: number; cashOutMinor: number }
  >();
  for (const acc of activeAccounts) {
    accountFlowMap.set(acc.id, { cashInMinor: 0, cashOutMinor: 0 });
  }
  const ensureAccFlow = (accountId: string) => {
    let entry = accountFlowMap.get(accountId);
    if (!entry) {
      entry = { cashInMinor: 0, cashOutMinor: 0 };
      accountFlowMap.set(accountId, entry);
    }
    return entry;
  };

  // --- 3. Project Cost Accumulators ---
  const projectDirectMap = new Map<string, number>();
  const projectBillsMap = new Map<string, number>();
  const projectIncomeMap = new Map<string, number>();

  for (const tx of transactions) {
    if (tx.status === 'voided' || tx.isDeleted) continue;
    const dateKey = normalizeDateKey(tx.date);
    if (!isWithinBounds(dateKey, bounds.startKey, bounds.endKey)) continue;

    const amt = tx.amountMinor || 0;

    if (tx.type === 'transfer') {
      transferVolumeMinor += amt;
      transferCount += 1;
      continue;
    }

    if (tx.type === 'income' || tx.type === 'refund') {
      totalIncomeMinor += amt;
      totalCashInMinor += amt;
      ensureAccFlow(tx.accountId).cashInMinor += amt;

      const isProject = tx.scope === 'project' && Boolean(tx.projectId);
      const key = isProject
        ? `prj:${tx.projectId}`
        : tx.type === 'refund'
          ? 'personal:refund'
          : 'personal:income';
      const label = isProject
        ? `${projectMap.get(tx.projectId!)?.name || 'Project'} Income`
        : tx.type === 'refund'
          ? 'Personal Refunds'
          : 'Personal Income';

      const prev = incomeBuckets.get(key) || {
        label,
        scope: isProject ? 'project' : 'personal',
        amountMinor: 0,
        count: 0,
      };
      prev.amountMinor += amt;
      prev.count += 1;
      incomeBuckets.set(key, prev);

      if (isProject && tx.projectId) {
        projectIncomeMap.set(tx.projectId, (projectIncomeMap.get(tx.projectId) || 0) + amt);
      }
      continue;
    }

    if (tx.type === 'expense') {
      directExpenseMinor += amt;
      totalCashOutMinor += amt;
      ensureAccFlow(tx.accountId).cashOutMinor += amt;

      const isProject = tx.scope === 'project' && Boolean(tx.projectId);
      const catId = tx.categoryId ? tx.categoryId.trim().toLowerCase() : 'other';
      const key = isProject ? `prj:${tx.projectId}` : `cat:${catId}`;
      const label = isProject
        ? `${projectMap.get(tx.projectId!)?.name || 'Project'} (Direct)`
        : tx.categoryId
          ? getPersonalCategoryLabel(catId)
          : 'Personal Expenses';

      const prev = expenseBuckets.get(key) || {
        label,
        scope: isProject ? 'project' : 'personal',
        amountMinor: 0,
        count: 0,
      };
      prev.amountMinor += amt;
      prev.count += 1;
      expenseBuckets.set(key, prev);

      if (isProject && tx.projectId) {
        projectDirectMap.set(tx.projectId, (projectDirectMap.get(tx.projectId) || 0) + amt);
      }
    }
  }

  // Obligations: payable bills count as P&L expense & project cost when incurred (accrual)
  for (const ob of obligations) {
    if (ob.status === 'voided' || ob.isDeleted) continue;
    if (ob.direction !== 'payable') continue;
    const dateKey = normalizeDateKey(ob.date);
    if (!isWithinBounds(dateKey, bounds.startKey, bounds.endKey)) continue;

    const amt = ob.totalAmountMinor || 0;
    billsIncurredMinor += amt;

    const isProject = Boolean(ob.projectId);
    const key = isProject ? `bill-prj:${ob.projectId}` : 'bill-personal';
    const label = isProject
      ? `${projectMap.get(ob.projectId!)?.name || 'Project'} (Bills)`
      : 'Personal Bills';

    const prev = expenseBuckets.get(key) || {
      label,
      scope: isProject ? 'project' : 'personal',
      amountMinor: 0,
      count: 0,
    };
    prev.amountMinor += amt;
    prev.count += 1;
    expenseBuckets.set(key, prev);

    if (isProject && ob.projectId) {
      projectBillsMap.set(ob.projectId, (projectBillsMap.get(ob.projectId) || 0) + amt);
    }
  }

  // Payments: affect Cash Flow ONLY (never P&L expense)
  for (const pay of payments) {
    if (pay.status === 'voided' || pay.isDeleted) continue;
    const dateKey = normalizeDateKey(pay.date);
    if (!isWithinBounds(dateKey, bounds.startKey, bounds.endKey)) continue;

    const amt = pay.amountMinor || 0;
    if (pay.direction === 'incoming') {
      totalCashInMinor += amt;
      ensureAccFlow(pay.accountId).cashInMinor += amt;
    } else {
      totalCashOutMinor += amt;
      ensureAccFlow(pay.accountId).cashOutMinor += amt;
    }
  }

  const totalExpenseMinor = directExpenseMinor + billsIncurredMinor;
  const netProfitMinor = totalIncomeMinor - totalExpenseMinor;
  const profitMarginPct =
    totalIncomeMinor > 0 ? Math.round((netProfitMinor * 100) / totalIncomeMinor) : null;

  const incomeLines: PnLLineItem[] = Array.from(incomeBuckets.entries())
    .map(([key, v]) => ({
      key,
      label: v.label,
      scope: v.scope,
      amountMinor: v.amountMinor,
      sharePct: totalIncomeMinor > 0 ? Math.round((v.amountMinor * 100) / totalIncomeMinor) : 0,
      count: v.count,
    }))
    .sort((a, b) => b.amountMinor - a.amountMinor);

  const expenseLines: PnLLineItem[] = Array.from(expenseBuckets.entries())
    .map(([key, v]) => ({
      key,
      label: v.label,
      scope: v.scope,
      amountMinor: v.amountMinor,
      sharePct: totalExpenseMinor > 0 ? Math.round((v.amountMinor * 100) / totalExpenseMinor) : 0,
      count: v.count,
    }))
    .sort((a, b) => b.amountMinor - a.amountMinor);

  const byAccount: AccountCashFlowRow[] = activeAccounts
    .map((acc) => {
      const flow = accountFlowMap.get(acc.id) || { cashInMinor: 0, cashOutMinor: 0 };
      return {
        accountId: acc.id,
        accountName: acc.name,
        accountType: acc.type,
        currentBalanceMinor: acc.currentBalanceMinor || 0,
        cashInMinor: flow.cashInMinor,
        cashOutMinor: flow.cashOutMinor,
        netChangeMinor: flow.cashInMinor - flow.cashOutMinor,
      };
    })
    .sort(
      (a, b) =>
        b.cashInMinor + b.cashOutMinor - (a.cashInMinor + a.cashOutMinor) ||
        b.currentBalanceMinor - a.currentBalanceMinor
    );

  // Project Cost Comparisons across all active (non-archived, non-deleted) projects
  const activeProjects = projects.filter((p) => p.status !== 'archived' && !p.isDeleted);
  let totalBudgetMinor = 0;
  let totalProjectSpentMinor = 0;
  let totalProjectDirectMinor = 0;
  let totalProjectBillsMinor = 0;

  const projectRows: ProjectCostRow[] = activeProjects
    .map((prj) => {
      const budgetMinor = prj.budgetMinor || 0;
      const direct = projectDirectMap.get(prj.id) || 0;
      const bills = projectBillsMap.get(prj.id) || 0;
      const spent = direct + bills;
      const income = projectIncomeMap.get(prj.id) || 0;
      const remaining = budgetMinor - spent;
      const utilizationPct =
        budgetMinor > 0 ? Math.round((spent * 100) / budgetMinor) : spent > 0 ? 100 : 0;

      totalBudgetMinor += budgetMinor;
      totalProjectSpentMinor += spent;
      totalProjectDirectMinor += direct;
      totalProjectBillsMinor += bills;

      return {
        projectId: prj.id,
        projectName: prj.name,
        status: prj.status,
        budgetMinor,
        directExpenseMinor: direct,
        billsIncurredMinor: bills,
        totalSpentMinor: spent,
        incomeMinor: income,
        remainingMinor: remaining,
        utilizationPct,
        alertLevel: classifyBudgetAlert(utilizationPct),
      };
    })
    .sort((a, b) => b.totalSpentMinor - a.totalSpentMinor || b.utilizationPct - a.utilizationPct);

  const overallUtilizationPct =
    totalBudgetMinor > 0
      ? Math.round((totalProjectSpentMinor * 100) / totalBudgetMinor)
      : totalProjectSpentMinor > 0
        ? 100
        : 0;

  return {
    period,
    periodLabel: bounds.label,
    periodRangeLabel: bounds.rangeLabel,
    pnl: {
      totalIncomeMinor,
      totalExpenseMinor,
      directExpenseMinor,
      billsIncurredMinor,
      netProfitMinor,
      profitMarginPct,
      incomeLines,
      expenseLines,
    },
    cashFlow: {
      totalCashInMinor,
      totalCashOutMinor,
      netCashFlowMinor: totalCashInMinor - totalCashOutMinor,
      transferVolumeMinor,
      transferCount,
      closingCashMinor,
      byAccount,
    },
    projectComparison: {
      totalBudgetMinor,
      totalSpentMinor: totalProjectSpentMinor,
      totalDirectMinor: totalProjectDirectMinor,
      totalBillsMinor: totalProjectBillsMinor,
      totalRemainingMinor: totalBudgetMinor - totalProjectSpentMinor,
      overallUtilizationPct,
      rows: projectRows,
    },
  };
}
