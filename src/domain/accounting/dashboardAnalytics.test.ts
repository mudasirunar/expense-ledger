import { describe, it, expect } from 'vitest';
import { computeDashboardAnalytics } from './dashboardAnalytics';
import { Account, Obligation, Payment, Project, Transaction } from '@/domain/entities';

const NOW = new Date(2026, 10, 25, 12, 0, 0); // 2026-11-25 local

const baseAccounts: Account[] = [
  {
    id: 'acc-1',
    name: 'Cash Wallet',
    type: 'cash',
    openingBalanceMinor: 5000000,
    currentBalanceMinor: 5000000, // Rs 50,000
    isArchived: false,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  },
  {
    id: 'acc-2',
    name: 'Meezan Bank',
    type: 'bank',
    openingBalanceMinor: 15000000,
    currentBalanceMinor: 15000000, // Rs 150,000
    isArchived: false,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  },
];

const baseProjects: Project[] = [
  {
    id: 'prj-1',
    name: 'House Construction',
    startDate: '2026-10-01',
    status: 'active',
    budgetMinor: 10000000, // Rs 100,000
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  },
];

const baseTransactions: Transaction[] = [
  {
    id: 'tx-1',
    idempotencyKey: 'k1',
    type: 'income',
    scope: 'personal',
    accountId: 'acc-2',
    categoryId: 'salary',
    amountMinor: 20000000, // Rs 200,000
    date: '2026-11-25',
    status: 'posted',
    createdAt: '2026-11-25T09:00:00Z',
    updatedAt: '2026-11-25T09:00:00Z',
  },
  {
    id: 'tx-2',
    idempotencyKey: 'k2',
    type: 'expense',
    scope: 'personal',
    accountId: 'acc-1',
    categoryId: 'groceries',
    amountMinor: 1500000, // Rs 15,000
    date: '2026-11-25',
    status: 'posted',
    createdAt: '2026-11-25T10:00:00Z',
    updatedAt: '2026-11-25T10:00:00Z',
  },
  {
    id: 'tx-3',
    idempotencyKey: 'k3',
    type: 'transfer',
    scope: 'personal',
    accountId: 'acc-2',
    targetAccountId: 'acc-1',
    amountMinor: 5000000, // P&L neutral
    date: '2026-11-25',
    status: 'posted',
    createdAt: '2026-11-25T11:00:00Z',
    updatedAt: '2026-11-25T11:00:00Z',
  },
  {
    id: 'tx-4',
    idempotencyKey: 'k4',
    type: 'expense',
    scope: 'project',
    projectId: 'prj-1',
    accountId: 'acc-1',
    categoryId: 'transport',
    amountMinor: 1000000, // Rs 10,000
    date: '2026-11-10',
    status: 'posted',
    createdAt: '2026-11-10T10:00:00Z',
    updatedAt: '2026-11-10T10:00:00Z',
  },
];

const baseObligations: Obligation[] = [
  {
    id: 'obl-1',
    type: 'purchase',
    direction: 'payable',
    projectId: 'prj-1',
    title: '100 Bags Cement',
    date: '2026-11-20',
    totalAmountMinor: 8000000, // Rs 80,000 -> total project spent = 90k / 100k = 90% (critical)
    allocatedAmountMinor: 3000000,
    remainingAmountMinor: 5000000, // Rs 50,000 payable
    status: 'partially_paid',
    createdAt: '2026-11-20T08:00:00Z',
    updatedAt: '2026-11-20T08:00:00Z',
  },
  {
    id: 'obl-2',
    type: 'customer_invoice',
    direction: 'receivable',
    projectId: 'prj-1',
    title: 'Client Milestone 1',
    date: '2026-11-22',
    totalAmountMinor: 6000000,
    allocatedAmountMinor: 2000000,
    remainingAmountMinor: 4000000, // Rs 40,000 receivable
    status: 'partially_paid',
    createdAt: '2026-11-22T08:00:00Z',
    updatedAt: '2026-11-22T08:00:00Z',
  },
];

const basePayments: Payment[] = [
  {
    id: 'pay-1',
    idempotencyKey: 'pk1',
    direction: 'outgoing',
    accountId: 'acc-2',
    projectId: 'prj-1',
    amountMinor: 4000000, // 30k allocated + 10k advance — must NOT double-count as expense!
    allocatedAmountMinor: 3000000,
    unallocatedAmountMinor: 1000000,
    date: '2026-11-21',
    method: 'bank_transfer',
    status: 'posted',
    createdAt: '2026-11-21T08:00:00Z',
    updatedAt: '2026-11-21T08:00:00Z',
  },
];

describe('computeDashboardAnalytics', () => {
  it('reconciles cash, P&L-neutral transfers, accrual obligations without double-counting payments, and project utilization', () => {
    const res = computeDashboardAnalytics({
      accounts: baseAccounts,
      projects: baseProjects,
      transactions: baseTransactions,
      obligations: baseObligations,
      payments: basePayments,
      timeHorizon: 'month',
      scopeFilter: 'all',
      now: NOW,
    });

    expect(res.totalCashMinor).toBe(20000000);
    expect(res.totalInflowMinor).toBe(20000000); // transfer excluded
    // Outflow = 15,000 (groceries) + 10,000 (transport) + 80,000 (cement obligation) = 105,000 (payment NOT double-counted)
    expect(res.totalOutflowMinor).toBe(10500000);
    expect(res.netFlowMinor).toBe(9500000);
    expect(res.savingsRatePct).toBe(48);

    expect(res.totalPayableMinor).toBe(5000000);
    expect(res.openPayableCount).toBe(1);
    expect(res.totalReceivableMinor).toBe(4000000);
    expect(res.openReceivableCount).toBe(1);
    expect(res.unallocatedAdvancesMinor).toBe(1000000);

    // Liquidity split: 25% Cash, 75% Bank
    const cashBucket = res.liquidityBreakdown.find((b) => b.type === 'cash');
    const bankBucket = res.liquidityBreakdown.find((b) => b.type === 'bank');
    expect(cashBucket?.sharePct).toBe(25);
    expect(bankBucket?.sharePct).toBe(75);

    // Project health: 90,000 / 100,000 = 90% => critical
    expect(res.projectHealth).toHaveLength(1);
    expect(res.projectHealth[0].spentMinor).toBe(9000000);
    expect(res.projectHealth[0].utilizationPct).toBe(90);
    expect(res.projectHealth[0].alertLevel).toBe('critical');

    // Category breakdown sorted descending (Bills 80k first)
    expect(res.categoryBreakdown[0].label).toBe('Bills');
    expect(res.categoryBreakdown[0].amountMinor).toBe(8000000);

    // Top accounts sorted by balance descending (Meezan Bank 150k first) & capped at 5
    expect(res.topAccounts[0].name).toBe('Meezan Bank');
    expect(res.topAccounts[0].sharePct).toBe(75);
    expect(res.totalActiveAccountsCount).toBe(2);

    // Recent activity capped at 5
    expect(res.recentActivity.length).toBeLessThanOrEqual(5);
    expect(res.totalActivityCount).toBeGreaterThanOrEqual(res.recentActivity.length);
  });

  it('strictly isolates personal scope from project expenses and obligations', () => {
    const res = computeDashboardAnalytics({
      accounts: baseAccounts,
      projects: baseProjects,
      transactions: baseTransactions,
      obligations: baseObligations,
      payments: basePayments,
      timeHorizon: 'month',
      scopeFilter: 'personal',
      now: NOW,
    });

    expect(res.totalInflowMinor).toBe(20000000);
    expect(res.totalOutflowMinor).toBe(1500000); // Only personal groceries
    expect(res.totalPayableMinor).toBe(0);
    expect(res.totalReceivableMinor).toBe(0);
    // Project budget health stays visible showing top active projects
    expect(res.projectHealth).toHaveLength(1);
  });

  it('pins a selected project to #1 if it falls outside the top 5', () => {
    const sevenProjects: Project[] = Array.from({ length: 7 }, (_, idx) => ({
      id: `prj-${idx + 1}`,
      name: `Project ${idx + 1}`,
      startDate: '2026-10-01',
      status: 'active',
      budgetMinor: 10000000,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    }));
    const txs: Transaction[] = sevenProjects.slice(0, 6).map((p, idx) => ({
      id: `tx-p-${idx}`,
      idempotencyKey: `kp-${idx}`,
      type: 'expense',
      scope: 'project',
      projectId: p.id,
      accountId: 'acc-1',
      amountMinor: (6 - idx) * 1000000, // prj-1 highest, prj-7 has 0 spent (rank #7)
      date: '2026-11-25',
      status: 'posted',
      createdAt: '2026-11-25T10:00:00Z',
      updatedAt: '2026-11-25T10:00:00Z',
    }));

    const res = computeDashboardAnalytics({
      accounts: baseAccounts,
      projects: sevenProjects,
      transactions: txs,
      obligations: [],
      payments: [],
      timeHorizon: 'all',
      scopeFilter: 'prj-7',
      now: NOW,
    });

    expect(res.projectHealth).toHaveLength(5);
    expect(res.projectHealth[0].id).toBe('prj-7');
    expect(res.projectHealth[1].id).toBe('prj-1');
    expect(res.totalActiveProjectsCount).toBe(7);
  });

  it('builds dynamic trend buckets per time horizon (7d for today, 4w for month, 6m for all)', () => {
    const todayRes = computeDashboardAnalytics({
      accounts: baseAccounts,
      projects: baseProjects,
      transactions: baseTransactions,
      obligations: baseObligations,
      payments: basePayments,
      timeHorizon: 'today',
      scopeFilter: 'all',
      now: NOW,
    });
    expect(todayRes.trendBuckets).toHaveLength(7);
    expect(todayRes.trendBuckets[6].label).toBe('Today');
    expect(todayRes.trendBuckets[6].inflowMinor).toBe(20000000);
    expect(todayRes.trendBuckets[6].outflowMinor).toBe(1500000);

    const monthRes = computeDashboardAnalytics({
      accounts: baseAccounts,
      projects: baseProjects,
      transactions: baseTransactions,
      obligations: baseObligations,
      payments: basePayments,
      timeHorizon: 'month',
      scopeFilter: 'all',
      now: NOW,
    });
    expect(monthRes.trendBuckets).toHaveLength(4);

    const allRes = computeDashboardAnalytics({
      accounts: baseAccounts,
      projects: baseProjects,
      transactions: baseTransactions,
      obligations: baseObligations,
      payments: basePayments,
      timeHorizon: 'all',
      scopeFilter: 'all',
      now: NOW,
    });
    expect(allRes.trendBuckets).toHaveLength(6);
  });
});
