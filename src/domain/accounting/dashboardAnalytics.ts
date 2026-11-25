/**
 * Executive Dashboard Analytics Engine
 * Pure integer minor-unit calculations — zero floating-point money math.
 *
 * Enforces all accounting invariants:
 * - Accrual Obligation Invariant: payable obligations count as project expenses when incurred;
 *   subsequent outgoing payments settle payables and are NEVER double-counted as expenses.
 * - Transfers are strictly P&L-neutral (zero impact on inflow, outflow, or project budgets).
 * - Voided records are excluded from all financial totals.
 */

import {
  Account,
  Obligation,
  ObligationType,
  Payment,
  Project,
  Transaction,
} from '@/domain/entities';

export type DashboardTimeHorizon = 'today' | 'month' | 'all';
export type DashboardScopeFilter = 'all' | 'personal' | string; // string = specific projectId

export interface DashboardAnalyticsInput {
  accounts: readonly Account[];
  projects: readonly Project[];
  transactions: readonly Transaction[];
  obligations: readonly Obligation[];
  payments: readonly Payment[];
  timeHorizon: DashboardTimeHorizon;
  scopeFilter: DashboardScopeFilter;
  pinSelectedProject?: boolean;
  now?: Date;
}

export interface LiquidityBucket {
  type: 'cash' | 'bank' | 'mobile_wallet' | 'other';
  label: string;
  balanceMinor: number;
  count: number;
  sharePct: number;
}

export interface TopAccountItem {
  id: string;
  name: string;
  type: 'cash' | 'bank' | 'mobile_wallet' | 'other';
  balanceMinor: number;
  sharePct: number;
}

export interface TrendBucket {
  key: string;
  label: string;
  inflowMinor: number;
  outflowMinor: number;
}

export interface CategoryBreakdownItem {
  key: string;
  label: string;
  amountMinor: number;
  sharePct: number;
  color: string;
}

export type BudgetAlertLevel = 'healthy' | 'warning' | 'critical' | 'over';

export interface ProjectHealthItem {
  id: string;
  name: string;
  status: Project['status'];
  budgetMinor: number;
  spentMinor: number;
  remainingMinor: number;
  utilizationPct: number;
  alertLevel: BudgetAlertLevel;
}

export interface ActivityFeedItem {
  id: string;
  kind: 'transaction' | 'obligation' | 'payment';
  title: string;
  subtitle: string;
  date: string; // YYYY-MM-DD
  sortKey: string;
  amountMinor: number;
  direction: 'in' | 'out' | 'neutral';
  badge: string;
  badgeTone?: 'positive' | 'warning' | 'neutral';
  isBillPayment?: boolean;
}

export interface DashboardAnalytics {
  totalCashMinor: number;
  totalInflowMinor: number;
  totalOutflowMinor: number;
  netFlowMinor: number;
  savingsRatePct: number | null;
  totalPayableMinor: number;
  openPayableCount: number;
  totalPaidPayableMinor: number;
  paidPayableCount: number;
  partialPayableCount: number;
  totalReceivableMinor: number;
  openReceivableCount: number;
  unallocatedAdvancesMinor: number;
  liquidityBreakdown: LiquidityBucket[];
  topAccounts: TopAccountItem[];
  totalActiveAccountsCount: number;
  trendBuckets: TrendBucket[];
  trendMaxMinor: number;
  trendSubtitle: string;
  categoryBreakdown: CategoryBreakdownItem[];
  projectHealth: ProjectHealthItem[];
  totalActiveProjectsCount: number;
  recentActivity: ActivityFeedItem[];
  totalActivityCount: number;
}

const CATEGORY_COLORS = [
  '#3B82F6', // Blue
  '#F43F5E', // Rose
  '#F59E0B', // Amber
  '#10B981', // Emerald
  '#8B5CF6', // Violet
  '#64748B', // Slate (Other)
];

const OBLIGATION_TYPE_LABELS: Record<ObligationType, string> = {
  purchase: 'Bills',
  contract_bill: 'Contractor Bills',
  labour_wage: 'Labour Wages',
  customer_invoice: 'Client Invoices',
};

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatLocalDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function normalizeDateKey(raw: string | undefined): string {
  if (!raw) return '';
  return raw.slice(0, 10);
}

function formatCategoryLabel(raw: string | undefined): string {
  if (!raw || !raw.trim()) return 'General Expenses';
  return raw
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function matchesTimeHorizon(dateKey: string, horizon: DashboardTimeHorizon, now: Date): boolean {
  if (horizon === 'all') return true;
  if (!dateKey) return false;
  const todayKey = formatLocalDateKey(now);
  if (horizon === 'today') return dateKey === todayKey;
  // 'month'
  return dateKey.slice(0, 7) === todayKey.slice(0, 7);
}

function matchesTransactionScope(tx: Transaction, scopeFilter: DashboardScopeFilter): boolean {
  if (scopeFilter === 'all') return true;
  if (scopeFilter === 'personal') return tx.scope === 'personal' && !tx.projectId;
  return tx.projectId === scopeFilter;
}

function matchesProjectEntityScope(projectId: string | undefined, scopeFilter: DashboardScopeFilter): boolean {
  if (scopeFilter === 'all') return true;
  if (scopeFilter === 'personal') return !projectId;
  return projectId === scopeFilter;
}

function computeBudgetAlert(utilizationPct: number): BudgetAlertLevel {
  if (utilizationPct >= 100) return 'over';
  if (utilizationPct >= 90) return 'critical';
  if (utilizationPct >= 80) return 'warning';
  return 'healthy';
}

export function computeDashboardAnalytics(input: DashboardAnalyticsInput): DashboardAnalytics {
  const {
    accounts,
    projects,
    transactions,
    obligations,
    payments,
    timeHorizon,
    scopeFilter,
    pinSelectedProject = true,
    now = new Date(),
  } = input;

  const projectNameMap = new Map<string, string>();
  for (const p of projects) {
    projectNameMap.set(p.id, p.name);
  }
  const accountNameMap = new Map<string, string>();
  for (const a of accounts) {
    accountNameMap.set(a.id, a.name);
  }

  // 1. Total Cash & Liquidity Breakdown (active accounts only)
  const activeAccounts = accounts.filter((a) => !a.isArchived);
  let totalCashMinor = 0;
  const liquidityMap: Record<'cash' | 'bank' | 'mobile_wallet' | 'other', { balanceMinor: number; count: number }> = {
    cash: { balanceMinor: 0, count: 0 },
    bank: { balanceMinor: 0, count: 0 },
    mobile_wallet: { balanceMinor: 0, count: 0 },
    other: { balanceMinor: 0, count: 0 },
  };

  for (const acc of activeAccounts) {
    const bal = acc.currentBalanceMinor || 0;
    totalCashMinor += bal;
    const bucket = liquidityMap[acc.type] ?? liquidityMap.other;
    bucket.balanceMinor += bal;
    bucket.count += 1;
  }

  const positiveTotalForShare = Math.max(
    0,
    liquidityMap.cash.balanceMinor +
      liquidityMap.bank.balanceMinor +
      liquidityMap.mobile_wallet.balanceMinor +
      liquidityMap.other.balanceMinor
  );

  const liquidityDefs: Array<{ type: LiquidityBucket['type']; label: string }> = [
    { type: 'cash', label: 'Cash' },
    { type: 'bank', label: 'Bank' },
    { type: 'mobile_wallet', label: 'Wallets' },
    { type: 'other', label: 'Other' },
  ];

  const liquidityBreakdown: LiquidityBucket[] = liquidityDefs
    .map(({ type, label }) => {
      const entry = liquidityMap[type];
      const sharePct =
        positiveTotalForShare > 0 && entry.balanceMinor > 0
          ? Math.round((entry.balanceMinor * 100) / positiveTotalForShare)
          : 0;
      return {
        type,
        label,
        balanceMinor: entry.balanceMinor,
        count: entry.count,
        sharePct,
      };
    })
    .filter((b) => b.count > 0 || b.type !== 'other');

  const topAccounts: TopAccountItem[] = [...activeAccounts]
    .sort((a, b) => (b.currentBalanceMinor || 0) - (a.currentBalanceMinor || 0))
    .slice(0, 5)
    .map((acc) => {
      const bal = acc.currentBalanceMinor || 0;
      const sharePct =
        positiveTotalForShare > 0 && bal > 0
          ? Math.round((bal * 100) / positiveTotalForShare)
          : 0;
      return {
        id: acc.id,
        name: acc.name,
        type: acc.type,
        balanceMinor: bal,
        sharePct,
      };
    });

  // 2. Period Inflow, Outflow, Category Breakdown (Accrual + P&L-neutral transfers)
  let totalInflowMinor = 0;
  let totalOutflowMinor = 0;
  const categoryTotals = new Map<string, number>();

  for (const tx of transactions) {
    if (tx.status === 'voided') continue;
    if (tx.type === 'transfer') continue; // Strictly P&L-neutral
    if (!matchesTransactionScope(tx, scopeFilter)) continue;

    const dateKey = normalizeDateKey(tx.date);
    if (!matchesTimeHorizon(dateKey, timeHorizon, now)) continue;

    const amt = tx.amountMinor || 0;
    if (tx.type === 'income' || tx.type === 'refund') {
      totalInflowMinor += amt;
    } else if (tx.type === 'expense') {
      totalOutflowMinor += amt;
      const catLabel = formatCategoryLabel(tx.categoryId);
      categoryTotals.set(catLabel, (categoryTotals.get(catLabel) || 0) + amt);
    }
  }

  // Payable obligations incurred in period count as recognized expenses;
  // receivable obligations are tracked under Receivables (inflow recognized via income/receipts).
  let totalPayableMinor = 0;
  let openPayableCount = 0;
  let totalPaidPayableMinor = 0;
  let paidPayableCount = 0;
  let partialPayableCount = 0;
  let totalReceivableMinor = 0;
  let openReceivableCount = 0;

  for (const ob of obligations) {
    if (ob.status === 'voided') continue;
    if (!matchesProjectEntityScope(ob.projectId, scopeFilter)) continue;

    const remaining = ob.remainingAmountMinor || 0;
    const allocated = ob.allocatedAmountMinor || 0;
    if (ob.direction === 'payable') {
      totalPaidPayableMinor += allocated;
      if (remaining > 0 && ob.status !== 'paid') {
        totalPayableMinor += remaining;
        openPayableCount += 1;
        if (allocated > 0) partialPayableCount += 1;
      } else if (ob.status === 'paid' || remaining <= 0) {
        paidPayableCount += 1;
      }
      const dateKey = normalizeDateKey(ob.date);
      if (matchesTimeHorizon(dateKey, timeHorizon, now)) {
        const amt = ob.totalAmountMinor || 0;
        totalOutflowMinor += amt;
        const catLabel = OBLIGATION_TYPE_LABELS[ob.type] || 'Project Obligations';
        categoryTotals.set(catLabel, (categoryTotals.get(catLabel) || 0) + amt);
      }
    } else if (ob.direction === 'receivable') {
      if (remaining > 0 && ob.status !== 'paid') {
        totalReceivableMinor += remaining;
        openReceivableCount += 1;
      }
    }
  }

  // Unallocated advances (standalone prepayments only — discard any legacy overpayment on bill payments)
  let unallocatedAdvancesMinor = 0;
  for (const pay of payments) {
    if (pay.status === 'voided') continue;
    if (pay.direction !== 'outgoing') continue;
    if (pay.linkedBillId || (pay.allocatedAmountMinor || 0) > 0) continue;
    if (!matchesProjectEntityScope(pay.projectId, scopeFilter)) continue;
    unallocatedAdvancesMinor += pay.unallocatedAmountMinor || 0;
  }

  const netFlowMinor = totalInflowMinor - totalOutflowMinor;
  const savingsRatePct =
    totalInflowMinor > 0 ? Math.round((netFlowMinor * 100) / totalInflowMinor) : null;

  // 3. Category Breakdown (top 5 + Other rollup)
  const sortedCategories = Array.from(categoryTotals.entries())
    .filter(([, amt]) => amt > 0)
    .sort((a, b) => b[1] - a[1]);

  const topCategories = sortedCategories.slice(0, 5);
  const restAmount = sortedCategories.slice(5).reduce((sum, [, amt]) => sum + amt, 0);
  if (restAmount > 0) {
    topCategories.push(['Other', restAmount]);
  }

  const categoryBreakdown: CategoryBreakdownItem[] = topCategories.map(([label, amountMinor], idx) => ({
    key: label.toLowerCase().replace(/\s+/g, '_'),
    label,
    amountMinor,
    sharePct: totalOutflowMinor > 0 ? Math.round((amountMinor * 100) / totalOutflowMinor) : 0,
    color: CATEGORY_COLORS[idx % CATEGORY_COLORS.length],
  }));

  // 4. Trend Buckets (Dynamic per timeHorizon)
  const { trendBuckets, trendSubtitle } = buildTrendBuckets(
    transactions,
    obligations,
    timeHorizon,
    scopeFilter,
    now
  );
  const trendMaxMinor = trendBuckets.reduce(
    (max, b) => Math.max(max, b.inflowMinor, b.outflowMinor),
    0
  );

  // 5. Project Budget Health (All-time project spent vs. budget)
  const spentByProject = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.status === 'voided' || tx.type !== 'expense' || !tx.projectId) continue;
    spentByProject.set(tx.projectId, (spentByProject.get(tx.projectId) || 0) + (tx.amountMinor || 0));
  }
  for (const ob of obligations) {
    if (ob.status === 'voided' || ob.direction !== 'payable' || !ob.projectId) continue;
    spentByProject.set(ob.projectId, (spentByProject.get(ob.projectId) || 0) + (ob.totalAmountMinor || 0));
  }

  const allProjectHealth: ProjectHealthItem[] = projects
    .filter((p) => p.status !== 'archived')
    .map((p) => {
      const budgetMinor = p.budgetMinor || 0;
      const spentMinor = spentByProject.get(p.id) || 0;
      const remainingMinor = budgetMinor - spentMinor;
      const utilizationPct = budgetMinor > 0 ? Math.round((spentMinor * 100) / budgetMinor) : 0;
      return {
        id: p.id,
        name: p.name,
        status: p.status,
        budgetMinor,
        spentMinor,
        remainingMinor,
        utilizationPct,
        alertLevel: computeBudgetAlert(utilizationPct),
      };
    })
    .sort((a, b) => b.utilizationPct - a.utilizationPct || b.spentMinor - a.spentMinor);

  // Always show top 5 active projects; pin selected project to #1 when requested
  // (e.g. chosen from top scope chips) or if it falls outside the top 5.
  const isSpecificProjectSelected = scopeFilter !== 'all' && scopeFilter !== 'personal';
  let projectHealth = allProjectHealth.slice(0, 5);
  if (
    isSpecificProjectSelected &&
    (pinSelectedProject || !projectHealth.some((p) => p.id === scopeFilter))
  ) {
    const selectedItem = allProjectHealth.find((p) => p.id === scopeFilter);
    if (selectedItem) {
      projectHealth = [selectedItem, ...allProjectHealth.filter((p) => p.id !== scopeFilter).slice(0, 4)];
    }
  }

  // 6. Unified Recent Activity Feed (latest 5 items for selected scope, independent of time horizon)
  const feed = buildActivityFeed({
    accounts,
    projects,
    transactions,
    obligations,
    payments,
    timeHorizon: 'all',
    scopeFilter,
    now,
  });

  return {
    totalCashMinor,
    totalInflowMinor,
    totalOutflowMinor,
    netFlowMinor,
    savingsRatePct,
    totalPayableMinor,
    openPayableCount,
    totalPaidPayableMinor,
    paidPayableCount,
    partialPayableCount,
    totalReceivableMinor,
    openReceivableCount,
    unallocatedAdvancesMinor,
    liquidityBreakdown,
    topAccounts,
    totalActiveAccountsCount: activeAccounts.length,
    trendBuckets,
    trendMaxMinor,
    trendSubtitle,
    categoryBreakdown,
    projectHealth,
    totalActiveProjectsCount: allProjectHealth.length,
    recentActivity: feed.slice(0, 5),
    totalActivityCount: feed.length,
  };
}

export interface ActivityFeedInput {
  accounts: readonly Account[];
  projects: readonly Project[];
  transactions: readonly Transaction[];
  obligations: readonly Obligation[];
  payments: readonly Payment[];
  timeHorizon?: DashboardTimeHorizon;
  scopeFilter?: DashboardScopeFilter;
  now?: Date;
}

export function buildActivityFeed(input: ActivityFeedInput): ActivityFeedItem[] {
  const {
    accounts,
    projects,
    transactions,
    obligations,
    payments,
    timeHorizon = 'all',
    scopeFilter = 'all',
    now = new Date(),
  } = input;

  const projectNameMap = new Map<string, string>();
  for (const p of projects) {
    projectNameMap.set(p.id, p.name);
  }
  const accountNameMap = new Map<string, string>();
  for (const a of accounts) {
    accountNameMap.set(a.id, a.name);
  }

  const feed: ActivityFeedItem[] = [];

  for (const tx of transactions) {
    if (tx.status === 'voided') continue;
    if (!matchesTransactionScope(tx, scopeFilter)) continue;
    const dateKey = normalizeDateKey(tx.date);
    if (!matchesTimeHorizon(dateKey, timeHorizon, now)) continue;

    const accName = accountNameMap.get(tx.accountId) || 'Account';
    const projName = tx.projectId ? projectNameMap.get(tx.projectId) : undefined;
    const isTransfer = tx.type === 'transfer';
    const isIn = tx.type === 'income' || tx.type === 'refund';

    const title = isTransfer
      ? `Transfer → ${accountNameMap.get(tx.targetAccountId || '') || 'Account'}`
      : tx.notes?.trim() || formatCategoryLabel(tx.categoryId) || (isIn ? 'Income' : 'Expense');

    const subtitleParts = [accName];
    if (projName) subtitleParts.push(projName);
    else if (!isTransfer) subtitleParts.push('Personal');

    feed.push({
      id: `tx-${tx.id}`,
      kind: 'transaction',
      title,
      subtitle: subtitleParts.join(' • '),
      date: dateKey,
      sortKey: `${dateKey}T${tx.createdAt || ''}`,
      amountMinor: tx.amountMinor || 0,
      direction: isTransfer ? 'neutral' : isIn ? 'in' : 'out',
      badge: isTransfer ? 'Transfer' : isIn ? (tx.type === 'refund' ? 'Refund' : 'Income') : 'Expense',
    });
  }

  const obligationMap = new Map<string, Obligation>();
  for (const o of obligations) {
    obligationMap.set(o.id, o);
  }

  for (const ob of obligations) {
    if (ob.status === 'voided') continue;
    if (!matchesProjectEntityScope(ob.projectId, scopeFilter)) continue;
    const dateKey = normalizeDateKey(ob.date);
    if (!matchesTimeHorizon(dateKey, timeHorizon, now)) continue;

    const projName = ob.projectId ? projectNameMap.get(ob.projectId) : undefined;
    const typeLabel = OBLIGATION_TYPE_LABELS[ob.type] || 'Bill';

    feed.push({
      id: `ob-${ob.id}`,
      kind: 'obligation',
      title: ob.title || typeLabel,
      subtitle: [typeLabel, projName || 'Personal'].filter(Boolean).join(' • '),
      date: dateKey,
      sortKey: `${dateKey}T${ob.createdAt || ''}`,
      amountMinor: ob.totalAmountMinor || 0,
      direction: ob.direction === 'receivable' ? 'in' : 'out',
      badge: 'Bill Logged',
      badgeTone: 'neutral',
    });
  }

  for (const pay of payments) {
    if (pay.status === 'voided') continue;
    if (!matchesProjectEntityScope(pay.projectId, scopeFilter)) continue;
    const dateKey = normalizeDateKey(pay.date);
    if (!matchesTimeHorizon(dateKey, timeHorizon, now)) continue;

    const accName = accountNameMap.get(pay.accountId) || 'Account';
    const projName = pay.projectId ? projectNameMap.get(pay.projectId) : undefined;
    const isIncoming = pay.direction === 'incoming';
    const isBillPayment = Boolean(pay.linkedBillId || (pay.allocatedAmountMinor || 0) > 0);
    const linkedBill = pay.linkedBillId ? obligationMap.get(pay.linkedBillId) : undefined;
    const billTitle = pay.linkedBillTitle || linkedBill?.title;

    let badge: string;
    let badgeTone: ActivityFeedItem['badgeTone'] = 'neutral';
    if (isBillPayment) {
      const outcome =
        pay.billSettlementStatus ||
        (linkedBill ? (linkedBill.status === 'paid' ? 'paid' : 'partially_paid') : 'paid');
      if (outcome === 'partially_paid') {
        badge = 'Partial Paid';
        badgeTone = 'warning';
      } else {
        badge = 'Bill Paid';
        badgeTone = 'positive';
      }
    } else {
      badge = pay.unallocatedAmountMinor > 0 ? 'Advance' : 'Payment';
    }

    const displayAmountMinor =
      isBillPayment && (pay.allocatedAmountMinor || 0) > 0
        ? pay.allocatedAmountMinor
        : pay.amountMinor || 0;

    feed.push({
      id: `pay-${pay.id}`,
      kind: 'payment',
      title: isBillPayment
        ? billTitle || pay.notes?.trim() || 'Bill Payment'
        : pay.notes?.trim() || (isIncoming ? 'Client Receipt' : 'Payment'),
      subtitle: [accName, projName || 'Personal'].filter(Boolean).join(' • '),
      date: dateKey,
      sortKey: `${dateKey}T${pay.createdAt || ''}`,
      amountMinor: displayAmountMinor,
      direction: isIncoming ? 'in' : 'out',
      badge,
      badgeTone,
      isBillPayment,
    });
  }

  feed.sort((a, b) => (a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0));
  return feed;
}

function buildTrendBuckets(
  transactions: readonly Transaction[],
  obligations: readonly Obligation[],
  timeHorizon: DashboardTimeHorizon,
  scopeFilter: DashboardScopeFilter,
  now: Date
): { trendBuckets: TrendBucket[]; trendSubtitle: string } {
  const buckets: TrendBucket[] = [];
  const bucketIndex = new Map<string, number>();

  if (timeHorizon === 'today') {
    // Last 7 days (ending today) so Today view still shows meaningful recent trajectory
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const key = formatLocalDateKey(d);
      bucketIndex.set(key, buckets.length);
      buckets.push({
        key,
        label: i === 0 ? 'Today' : WEEKDAY_SHORT[d.getDay()],
        inflowMinor: 0,
        outflowMinor: 0,
      });
    }

    accumulateTrend(transactions, obligations, scopeFilter, (dateKey) => bucketIndex.get(dateKey), buckets);
    return { trendBuckets: buckets, trendSubtitle: 'Last 7 days' };
  }

  if (timeHorizon === 'month') {
    // Weekly buckets for current month (W1: 1-7, W2: 8-14, W3: 15-21, W4: 22-31)
    const monthPrefix = formatLocalDateKey(now).slice(0, 7);
    const labels = ['W1', 'W2', 'W3', 'W4'];
    labels.forEach((label, idx) => {
      buckets.push({
        key: `${monthPrefix}-W${idx + 1}`,
        label,
        inflowMinor: 0,
        outflowMinor: 0,
      });
    });

    accumulateTrend(
      transactions,
      obligations,
      scopeFilter,
      (dateKey) => {
        if (!dateKey.startsWith(monthPrefix)) return undefined;
        const day = Number.parseInt(dateKey.slice(8, 10), 10);
        if (Number.isNaN(day)) return undefined;
        if (day <= 7) return 0;
        if (day <= 14) return 1;
        if (day <= 21) return 2;
        return 3;
      },
      buckets
    );
    return { trendBuckets: buckets, trendSubtitle: `${MONTH_SHORT[now.getMonth()]} weekly` };
  }

  // 'all': Last 6 months trajectory
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    bucketIndex.set(key, buckets.length);
    buckets.push({
      key,
      label: MONTH_SHORT[d.getMonth()],
      inflowMinor: 0,
      outflowMinor: 0,
    });
  }

  accumulateTrend(
    transactions,
    obligations,
    scopeFilter,
    (dateKey) => bucketIndex.get(dateKey.slice(0, 7)),
    buckets
  );
  return { trendBuckets: buckets, trendSubtitle: 'Last 6 months' };
}

function accumulateTrend(
  transactions: readonly Transaction[],
  obligations: readonly Obligation[],
  scopeFilter: DashboardScopeFilter,
  getBucketIdx: (dateKey: string) => number | undefined,
  buckets: TrendBucket[]
) {
  for (const tx of transactions) {
    if (tx.status === 'voided' || tx.type === 'transfer') continue;
    if (!matchesTransactionScope(tx, scopeFilter)) continue;
    const idx = getBucketIdx(normalizeDateKey(tx.date));
    if (idx === undefined) continue;
    if (tx.type === 'income' || tx.type === 'refund') {
      buckets[idx].inflowMinor += tx.amountMinor || 0;
    } else if (tx.type === 'expense') {
      buckets[idx].outflowMinor += tx.amountMinor || 0;
    }
  }

  for (const ob of obligations) {
    if (ob.status === 'voided' || ob.direction !== 'payable') continue;
    if (!matchesProjectEntityScope(ob.projectId, scopeFilter)) continue;
    const idx = getBucketIdx(normalizeDateKey(ob.date));
    if (idx === undefined) continue;
    buckets[idx].outflowMinor += ob.totalAmountMinor || 0;
  }
}
