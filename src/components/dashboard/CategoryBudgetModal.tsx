import React, { useEffect, useState } from 'react';
import { Button, Input, SegmentedControl } from 'glisse';
import { AlertCircle, Trash2, X } from 'lucide-react';
import { BudgetPeriod, CategoryBudget } from '@/domain/entities';
import { DomainUseCases } from '@/domain/usecases';
import { Money } from '@/domain/accounting/money';
import {
  PERSONAL_EXPENSE_CATEGORIES,
  getPersonalCategoryLabel,
} from '@/domain/accounting/budgetEngine';
import { FirestoreBudgetRepository } from '@/data/repositories/firestore';
import { awaitLocalCommit } from '@/data/sync/dataWipeService';
import { useAuth } from '@/app/providers/AuthProvider';
import { useSnackbar } from '@/app/providers/SnackbarProvider';
import { ModalPortal } from '@/components/common/ModalPortal';

const budgetRepo = new FirestoreBudgetRepository();

interface CategoryBudgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingBudgets: readonly CategoryBudget[];
  editingBudget?: CategoryBudget | null;
  onDeleted?: (budgetId: string) => void;
}

export const CategoryBudgetModal: React.FC<CategoryBudgetModalProps> = ({
  isOpen,
  onClose,
  existingBudgets,
  editingBudget = null,
  onDeleted,
}) => {
  const { user } = useAuth();
  const { showSnackbar } = useSnackbar();
  const userId = user?.uid || 'guest-user';

  const [categoryId, setCategoryId] = useState<string>('food_dining');
  const [period, setPeriod] = useState<BudgetPeriod>('monthly');
  const [limitStr, setLimitStr] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    if (editingBudget) {
      setCategoryId(editingBudget.categoryId);
      setPeriod(editingBudget.period);
      const major = Money.toMajorString(editingBudget.limitMinor);
      setLimitStr(major.endsWith('.00') ? major.slice(0, -3) : major);
    } else {
      const usedKeys = new Set(
        existingBudgets.map((b) => `${b.categoryId.toLowerCase()}::${b.period}`)
      );
      const firstUnused = PERSONAL_EXPENSE_CATEGORIES.find(
        (c) => !usedKeys.has(`${c.id}::monthly`)
      );
      setCategoryId(firstUnused?.id || PERSONAL_EXPENSE_CATEGORIES[0].id);
      setPeriod('monthly');
      setLimitStr('');
    }
  }, [isOpen, editingBudget, existingBudgets]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || deleting) return;

    const parsedLimit = parseFloat(limitStr);
    if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
      setError('Budget limit must be greater than zero.');
      return;
    }

    const limitMinor = Money.fromMajor(parsedLimit).minorUnits;
    const categoryLabel = getPersonalCategoryLabel(categoryId);

    // Prevent duplicate active budgets for the same (category, period)
    const duplicate = existingBudgets.find(
      (b) =>
        b.id !== editingBudget?.id &&
        b.categoryId.toLowerCase() === categoryId.toLowerCase() &&
        b.period === period
    );
    if (duplicate) {
      setError(
        `A ${period} budget for ${categoryLabel} already exists. Tap it on the dashboard to edit.`
      );
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      if (editingBudget) {
        await awaitLocalCommit(
          budgetRepo.update(userId, editingBudget.id, {
            categoryId,
            categoryLabel,
            period,
            limitMinor,
          })
        );
        showSnackbar({ message: `${categoryLabel} budget updated.`, tone: 'success' });
      } else {
        const budget = DomainUseCases.createCategoryBudget({
          categoryId,
          categoryLabel,
          period,
          limitMinor,
        });
        await awaitLocalCommit(budgetRepo.create(userId, budget));
        showSnackbar({ message: `${categoryLabel} budget set.`, tone: 'success' });
      }
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save budget.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!editingBudget || submitting || deleting) return;
    setDeleting(true);
    setError(null);
    const targetId = editingBudget.id;
    const targetLabel = editingBudget.categoryLabel;
    try {
      // Immediately hard-delete locally + write delete-wins tombstone in deleted_records (syncs in background)
      await awaitLocalCommit(budgetRepo.delete(userId, targetId, targetLabel));
      onDeleted?.(targetId);
      showSnackbar({ message: `${targetLabel} budget removed.`, tone: 'default' });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to remove budget.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <ModalPortal isOpen={isOpen}>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/20 dark:bg-black/60 backdrop-blur-sm animate-fade-in overflow-y-auto overflow-x-hidden overscroll-none">
        <div className="w-full max-w-md p-4 sm:p-6 rounded-3xl space-y-4 sm:space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden box-border bg-[var(--lg-surface)] border border-[var(--lg-surface-edge)] backdrop-blur-2xl">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-extrabold text-[var(--lg-foreground)]">
              {editingBudget ? 'Edit Category Budget' : 'Set Category Budget'}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-full text-[var(--lg-muted)] hover:text-[var(--lg-foreground)]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400 bg-red-500/10 px-3 py-2 rounded-xl border border-red-500/20">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-semibold text-[var(--lg-muted)] uppercase tracking-wider mb-1">
                Personal Category *
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full h-10 px-3 rounded-2xl theme-select text-xs font-medium focus:outline-none cursor-pointer"
              >
                {PERSONAL_EXPENSE_CATEGORIES.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[var(--lg-muted)] uppercase tracking-wider mb-1.5">
                Reset Period
              </label>
              <div className="flex justify-start w-full">
                <SegmentedControl
                  items={[
                    { value: 'monthly', label: 'Monthly' },
                    { value: 'weekly', label: 'Weekly' },
                  ]}
                  value={period}
                  onValueChange={(val) => {
                    if (val) setPeriod(val as BudgetPeriod);
                  }}
                  style={{ '--lg-tab-width': '120px', '--lg-tab-height': '36px' } as React.CSSProperties}
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[var(--lg-muted)] uppercase tracking-wider mb-1">
                Budget Limit (Rs) *
              </label>
              <Input
                type="number"
                placeholder="e.g. 25000"
                value={limitStr}
                onValueChange={setLimitStr}
                className="!max-w-none"
                required
              />
              <p className="text-[11px] text-[var(--lg-muted)] mt-1.5">
                Alerts trigger automatically at 80% (Warning), 90% (Critical), and 100% (Over).
              </p>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2">
              {editingBudget ? (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={submitting || deleting}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {deleting ? 'Removing…' : 'Remove'}
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <Button variant="glass" type="button" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  variant="filled"
                  tint="#2563EB"
                  type="submit"
                  disabled={submitting || deleting}
                >
                  {submitting ? 'Saving…' : editingBudget ? 'Save Changes' : 'Save Budget'}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
};
