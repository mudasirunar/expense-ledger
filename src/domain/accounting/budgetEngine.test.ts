import { describe, expect, it } from 'vitest';
import { CategoryBudget, Transaction } from '@/domain/entities';
import {
  classifyBudgetAlert,
  computeCategoryBudgets,
  getCurrentPeriodRange,
} from './budgetEngine';

function makeBudget(overrides: Partial<CategoryBudget> = {}): CategoryBudget {
  return {
    id: 'bdg-1',
    categoryId: 'food_dining',
    categoryLabel: 'Food & Dining',
    period: 'monthly',
    limitMinor: 100_000, // Rs 1,000.00
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    idempotencyKey: 'idem-1',
    type: 'expense',
    scope: 'personal',
    accountId: 'acc-1',
    categoryId: 'food_dining',
    amountMinor: 25_000,
    date: '2026-04-15',
    status: 'posted',
    createdAt: '2026-04-15T10:00:00.000Z',
    updatedAt: '2026-04-15T10:00:00.000Z',
    ...overrides,
  };
}

describe('Personal Category Budget Engine', () => {
  const now = new Date(2026, 3, 16); // Thu Apr 16, 2026

  it('classifies 80% / 90% / 100% alert thresholds accurately', () => {
    expect(classifyBudgetAlert(0)).toBe('healthy');
    expect(classifyBudgetAlert(79)).toBe('healthy');
    expect(classifyBudgetAlert(80)).toBe('warning');
    expect(classifyBudgetAlert(89)).toBe('warning');
    expect(classifyBudgetAlert(90)).toBe('critical');
    expect(classifyBudgetAlert(99)).toBe('critical');
    expect(classifyBudgetAlert(100)).toBe('over');
    expect(classifyBudgetAlert(145)).toBe('over');
  });

  it('computes monthly and weekly period ranges correctly', () => {
    const monthly = getCurrentPeriodRange('monthly', now);
    expect(monthly.startKey).toBe('2026-04-01');
    expect(monthly.endKey).toBe('2026-04-30');

    const weekly = getCurrentPeriodRange('weekly', now);
    // Apr 16, 2026 is Thursday -> Mon Apr 13 to Sun Apr 19
    expect(weekly.startKey).toBe('2026-04-13');
    expect(weekly.endKey).toBe('2026-04-19');
  });

  it('aggregates only posted personal expenses in the active period and nets refunds', () => {
    const budgets = [
      makeBudget({ id: 'b-food', categoryId: 'food_dining', limitMinor: 100_000, period: 'monthly' }),
      makeBudget({ id: 'b-fuel', categoryId: 'transport_fuel', categoryLabel: 'Transport & Fuel', limitMinor: 50_000, period: 'weekly' }),
    ];

    const transactions = [
      // Food: 85,000 in April (85% -> warning)
      makeTx({ id: 't1', categoryId: 'food_dining', amountMinor: 90_000, date: '2026-04-05' }),
      makeTx({ id: 't2', type: 'refund', categoryId: 'food_dining', amountMinor: 5_000, date: '2026-04-10' }),
      // Ignored: previous month
      makeTx({ id: 't3', categoryId: 'food_dining', amountMinor: 50_000, date: '2026-03-31' }),
      // Ignored: project scope
      makeTx({ id: 't4', scope: 'project', projectId: 'prj-1', categoryId: 'food_dining', amountMinor: 50_000, date: '2026-04-12' }),
      // Ignored: voided
      makeTx({ id: 't5', status: 'voided', categoryId: 'food_dining', amountMinor: 50_000, date: '2026-04-12' }),
      // Fuel: 55,000 this week (110% -> over), plus 20,000 earlier in April (outside current week)
      makeTx({ id: 't6', categoryId: 'transport_fuel', amountMinor: 55_000, date: '2026-04-14' }),
      makeTx({ id: 't7', categoryId: 'transport_fuel', amountMinor: 20_000, date: '2026-04-02' }),
    ];

    const summary = computeCategoryBudgets(budgets, transactions, now);

    // Sorted by utilizationPct descending: Fuel (110%) before Food (85%)
    expect(summary.items).toHaveLength(2);
    expect(summary.items[0].categoryId).toBe('transport_fuel');
    expect(summary.items[0].spentMinor).toBe(55_000);
    expect(summary.items[0].remainingMinor).toBe(-5_000);
    expect(summary.items[0].utilizationPct).toBe(110);
    expect(summary.items[0].alertLevel).toBe('over');

    expect(summary.items[1].categoryId).toBe('food_dining');
    expect(summary.items[1].spentMinor).toBe(85_000);
    expect(summary.items[1].remainingMinor).toBe(15_000);
    expect(summary.items[1].utilizationPct).toBe(85);
    expect(summary.items[1].alertLevel).toBe('warning');

    expect(summary.overCount).toBe(1);
    expect(summary.warningCount).toBe(1);
    expect(summary.criticalCount).toBe(0);
    expect(summary.alertCount).toBe(2);
  });
});
