/**
 * Periodic Personal Category Budget Engine
 * Pure integer minor-unit calculations — zero floating-point money math.
 *
 * Alert thresholds:
 * - < 80%  -> 'healthy'
 * - 80-89% -> 'warning'  (80% warning alert)
 * - 90-99% -> 'critical' (90% critical alert)
 * - >= 100% -> 'over'    (100% over-budget alert)
 */

import { BudgetPeriod, CategoryBudget, Transaction } from '@/domain/entities';
import { BudgetAlertLevel } from './dashboardAnalytics';

export interface PersonalCategoryOption {
  readonly id: string;
  readonly label: string;
}

export const PERSONAL_EXPENSE_CATEGORIES: readonly PersonalCategoryOption[] = [
  { id: 'food_dining', label: 'Food & Dining' },
  { id: 'groceries', label: 'Groceries' },
  { id: 'transport_fuel', label: 'Transport & Fuel' },
  { id: 'utilities_bills', label: 'Utilities & Bills' },
  { id: 'housing_rent', label: 'Housing & Rent' },
  { id: 'healthcare', label: 'Healthcare' },
  { id: 'shopping', label: 'Shopping' },
  { id: 'education', label: 'Education' },
  { id: 'entertainment', label: 'Entertainment' },
  { id: 'family_gifts', label: 'Family & Gifts' },
  { id: 'other', label: 'Other Personal' },
] as const;

export function getPersonalCategoryLabel(categoryId: string): string {
  const found = PERSONAL_EXPENSE_CATEGORIES.find((c) => c.id === categoryId);
  if (found) return found.label;
  return categoryId
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export interface CategoryBudgetProgress {
  readonly id: string;
  readonly categoryId: string;
  readonly categoryLabel: string;
  readonly period: BudgetPeriod;
  readonly periodLabel: string;
  readonly limitMinor: number;
  readonly spentMinor: number;
  readonly remainingMinor: number;
  readonly utilizationPct: number;
  readonly alertLevel: BudgetAlertLevel;
}

export interface CategoryBudgetSummary {
  readonly items: readonly CategoryBudgetProgress[];
  readonly overCount: number;
  readonly criticalCount: number;
  readonly warningCount: number;
  readonly alertCount: number;
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

/**
 * Returns inclusive [startDateKey, endDateKey] for the current period window.
 * - monthly: 1st through last day of the current calendar month.
 * - weekly: Monday through Sunday of the current week.
 */
export function getCurrentPeriodRange(
  period: BudgetPeriod,
  now: Date = new Date()
): { startKey: string; endKey: string; label: string } {
  if (period === 'weekly') {
    const dayOfWeek = now.getDay(); // 0 = Sun, 1 = Mon, ...
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday);
    const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
    return {
      startKey: toLocalDateKey(monday),
      endKey: toLocalDateKey(sunday),
      label: 'This Week',
    };
  }

  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    startKey: toLocalDateKey(firstDay),
    endKey: toLocalDateKey(lastDay),
    label: 'This Month',
  };
}

export function classifyBudgetAlert(utilizationPct: number): BudgetAlertLevel {
  if (utilizationPct >= 100) return 'over';
  if (utilizationPct >= 90) return 'critical';
  if (utilizationPct >= 80) return 'warning';
  return 'healthy';
}

export function computeCategoryBudgets(
  budgets: readonly CategoryBudget[],
  transactions: readonly Transaction[],
  now: Date = new Date()
): CategoryBudgetSummary {
  const monthRange = getCurrentPeriodRange('monthly', now);
  const weekRange = getCurrentPeriodRange('weekly', now);

  // Pre-aggregate posted personal spending by (period, categoryId)
  const monthlySpendByCat = new Map<string, number>();
  const weeklySpendByCat = new Map<string, number>();

  for (const tx of transactions) {
    if (tx.status === 'voided') continue;
    if (tx.scope !== 'personal') continue;
    if (tx.type !== 'expense' && tx.type !== 'refund') continue;

    const catKey = (tx.categoryId || 'other').trim().toLowerCase();
    const dateKey = normalizeDateKey(tx.date);
    if (!dateKey) continue;

    const delta = tx.type === 'expense' ? tx.amountMinor : -tx.amountMinor;

    if (dateKey >= monthRange.startKey && dateKey <= monthRange.endKey) {
      monthlySpendByCat.set(catKey, (monthlySpendByCat.get(catKey) || 0) + delta);
    }
    if (dateKey >= weekRange.startKey && dateKey <= weekRange.endKey) {
      weeklySpendByCat.set(catKey, (weeklySpendByCat.get(catKey) || 0) + delta);
    }
  }

  const items: CategoryBudgetProgress[] = budgets
    .filter((b) => !b.isDeleted && b.limitMinor > 0)
    .map((b) => {
      const catKey = b.categoryId.trim().toLowerCase();
      const rawSpent =
        b.period === 'weekly'
          ? weeklySpendByCat.get(catKey) || 0
          : monthlySpendByCat.get(catKey) || 0;
      const spentMinor = Math.max(0, rawSpent);
      const remainingMinor = b.limitMinor - spentMinor;
      const utilizationPct = Math.round((spentMinor * 100) / b.limitMinor);
      const alertLevel = classifyBudgetAlert(utilizationPct);

      return {
        id: b.id,
        categoryId: b.categoryId,
        categoryLabel: b.categoryLabel || getPersonalCategoryLabel(b.categoryId),
        period: b.period,
        periodLabel: b.period === 'weekly' ? weekRange.label : monthRange.label,
        limitMinor: b.limitMinor,
        spentMinor,
        remainingMinor,
        utilizationPct,
        alertLevel,
      };
    })
    .sort((a, b) => b.utilizationPct - a.utilizationPct || b.spentMinor - a.spentMinor);

  let overCount = 0;
  let criticalCount = 0;
  let warningCount = 0;
  for (const item of items) {
    if (item.alertLevel === 'over') overCount += 1;
    else if (item.alertLevel === 'critical') criticalCount += 1;
    else if (item.alertLevel === 'warning') warningCount += 1;
  }

  return {
    items,
    overCount,
    criticalCount,
    warningCount,
    alertCount: overCount + criticalCount + warningCount,
  };
}
