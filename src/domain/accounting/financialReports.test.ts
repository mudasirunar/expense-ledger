import { describe, expect, it } from 'vitest';
import { Account, Obligation, Payment, Project, Transaction } from '@/domain/entities';
import { computeFinancialReports, getReportPeriodBounds } from './financialReports';

describe('Financial Reports Engine', () => {
  const now = new Date(2026, 3, 16); // Apr 16, 2026 (Q2 2026)

  const accounts: Account[] = [
    {
      id: 'acc-cash',
      name: 'Main Cash',
      type: 'cash',
      openingBalanceMinor: 500_000,
      currentBalanceMinor: 720_000,
      isArchived: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-04-16T00:00:00.000Z',
    },
    {
      id: 'acc-bank',
      name: 'HBL Bank',
      type: 'bank',
      openingBalanceMinor: 1_000_000,
      currentBalanceMinor: 900_000,
      isArchived: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-04-16T00:00:00.000Z',
    },
  ];

  const projects: Project[] = [
    {
      id: 'prj-villa',
      name: 'Villa A',
      startDate: '2026-01-01',
      status: 'active',
      budgetMinor: 500_000,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'prj-plaza',
      name: 'Plaza B',
      startDate: '2026-02-01',
      status: 'active',
      budgetMinor: 200_000,
      createdAt: '2026-02-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
    },
  ];

  const transactions: Transaction[] = [
    // April income: Rs 4,000.00
    {
      id: 'tx-in',
      idempotencyKey: 'i1',
      type: 'income',
      scope: 'project',
      projectId: 'prj-villa',
      accountId: 'acc-cash',
      amountMinor: 400_000,
      date: '2026-04-05',
      status: 'posted',
      createdAt: '2026-04-05T09:00:00.000Z',
      updatedAt: '2026-04-05T09:00:00.000Z',
    },
    // April personal expense: Rs 500.00
    {
      id: 'tx-exp-personal',
      idempotencyKey: 'i2',
      type: 'expense',
      scope: 'personal',
      accountId: 'acc-cash',
      categoryId: 'food_dining',
      amountMinor: 50_000,
      date: '2026-04-06',
      status: 'posted',
      createdAt: '2026-04-06T09:00:00.000Z',
      updatedAt: '2026-04-06T09:00:00.000Z',
    },
    // April project direct expense on Villa A: Rs 1,000.00
    {
      id: 'tx-exp-prj',
      idempotencyKey: 'i3',
      type: 'expense',
      scope: 'project',
      projectId: 'prj-villa',
      accountId: 'acc-bank',
      amountMinor: 100_000,
      date: '2026-04-07',
      status: 'posted',
      createdAt: '2026-04-07T09:00:00.000Z',
      updatedAt: '2026-04-07T09:00:00.000Z',
    },
    // April internal transfer: Rs 2,000.00 (P&L neutral, zero net cash impact)
    {
      id: 'tx-xfer',
      idempotencyKey: 'i4',
      type: 'transfer',
      scope: 'personal',
      accountId: 'acc-bank',
      targetAccountId: 'acc-cash',
      amountMinor: 200_000,
      date: '2026-04-08',
      status: 'posted',
      createdAt: '2026-04-08T09:00:00.000Z',
      updatedAt: '2026-04-08T09:00:00.000Z',
    },
    // March expense (outside April month, inside year/all)
    {
      id: 'tx-mar',
      idempotencyKey: 'i5',
      type: 'expense',
      scope: 'project',
      projectId: 'prj-plaza',
      accountId: 'acc-cash',
      amountMinor: 220_000,
      date: '2026-03-15',
      status: 'posted',
      createdAt: '2026-03-15T09:00:00.000Z',
      updatedAt: '2026-03-15T09:00:00.000Z',
    },
  ];

  const obligations: Obligation[] = [
    // April payable bill on Villa A: Rs 1,500.00 (counts as P&L expense, NOT cash out)
    {
      id: 'obl-1',
      type: 'purchase',
      direction: 'payable',
      projectId: 'prj-villa',
      title: 'Cement Batch',
      date: '2026-04-10',
      totalAmountMinor: 150_000,
      allocatedAmountMinor: 0,
      remainingAmountMinor: 150_000,
      status: 'unpaid',
      createdAt: '2026-04-10T10:00:00.000Z',
      updatedAt: '2026-04-10T10:00:00.000Z',
    },
  ];

  const payments: Payment[] = [
    // April outgoing payment: Rs 800.00 (counts as Cash Out, NOT P&L expense!)
    {
      id: 'pay-1',
      idempotencyKey: 'p1',
      direction: 'outgoing',
      accountId: 'acc-bank',
      projectId: 'prj-villa',
      amountMinor: 80_000,
      allocatedAmountMinor: 80_000,
      unallocatedAmountMinor: 0,
      date: '2026-04-11',
      method: 'bank_transfer',
      status: 'posted',
      createdAt: '2026-04-11T10:00:00.000Z',
      updatedAt: '2026-04-11T10:00:00.000Z',
    },
  ];

  it('computes period boundaries for month, quarter, year, and all', () => {
    expect(getReportPeriodBounds('month', now).startKey).toBe('2026-04-01');
    expect(getReportPeriodBounds('month', now).endKey).toBe('2026-04-30');
    expect(getReportPeriodBounds('quarter', now).startKey).toBe('2026-04-01');
    expect(getReportPeriodBounds('quarter', now).endKey).toBe('2026-06-30');
    expect(getReportPeriodBounds('year', now).startKey).toBe('2026-01-01');
    expect(getReportPeriodBounds('year', now).endKey).toBe('2026-12-31');
    expect(getReportPeriodBounds('all', now).startKey).toBeNull();
  });

  it('enforces accrual P&L vs cash-basis Cash Flow without double-counting payments or transfers', () => {
    const report = computeFinancialReports({
      accounts,
      projects,
      transactions,
      obligations,
      payments,
      period: 'month',
      now,
    });

    // P&L (April): Income 400k; Expenses = 50k personal + 100k direct + 150k bill = 300k (payment 80k NOT double-counted, transfer 200k excluded)
    expect(report.pnl.totalIncomeMinor).toBe(400_000);
    expect(report.pnl.directExpenseMinor).toBe(150_000);
    expect(report.pnl.billsIncurredMinor).toBe(150_000);
    expect(report.pnl.totalExpenseMinor).toBe(300_000);
    expect(report.pnl.netProfitMinor).toBe(100_000);
    expect(report.pnl.profitMarginPct).toBe(25);

    // Cash Flow (April): Cash In 400k; Cash Out = 50k + 100k + 80k payment = 230k (unpaid bill 150k NOT cash out)
    expect(report.cashFlow.totalCashInMinor).toBe(400_000);
    expect(report.cashFlow.totalCashOutMinor).toBe(230_000);
    expect(report.cashFlow.netCashFlowMinor).toBe(170_000);
    expect(report.cashFlow.transferVolumeMinor).toBe(200_000);
    expect(report.cashFlow.transferCount).toBe(1);
    expect(report.cashFlow.closingCashMinor).toBe(1_620_000);

    // Project Comparison (April): Villa A = 100k direct + 150k bill = 250k / 500k (50%)
    const villa = report.projectComparison.rows.find((r) => r.projectId === 'prj-villa');
    expect(villa?.directExpenseMinor).toBe(100_000);
    expect(villa?.billsIncurredMinor).toBe(150_000);
    expect(villa?.totalSpentMinor).toBe(250_000);
    expect(villa?.utilizationPct).toBe(50);
    expect(villa?.alertLevel).toBe('healthy');
  });

  it('flags over-budget projects when viewing full year', () => {
    const report = computeFinancialReports({
      accounts,
      projects,
      transactions,
      obligations,
      payments,
      period: 'year',
      now,
    });

    const plaza = report.projectComparison.rows.find((r) => r.projectId === 'prj-plaza');
    expect(plaza?.totalSpentMinor).toBe(220_000);
    expect(plaza?.remainingMinor).toBe(-20_000);
    expect(plaza?.utilizationPct).toBe(110);
    expect(plaza?.alertLevel).toBe('over');
  });
});
