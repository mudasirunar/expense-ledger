import React, { useState, useEffect } from 'react';
import { Project, Contact, Account, Obligation, ObligationStatus, PaymentMethod } from '@/domain/entities';
import { 
  FirestoreProjectRepository, 
  FirestoreContactRepository, 
  FirestoreAccountRepository,
  FirestoreTransactionRepository,
  FirestoreObligationRepository,
  FirestorePaymentRepository
} from '@/data/repositories/firestore';
import { DomainUseCases } from '@/domain/usecases';
import { Money } from '@/domain/accounting/money';
import { PERSONAL_EXPENSE_CATEGORIES } from '@/domain/accounting/budgetEngine';
import { useAuth } from '@/app/providers/AuthProvider';
import { useSnackbar } from '@/app/providers/SnackbarProvider';
import { Button, Input, SegmentedControl } from 'glisse';
import { X, Calendar } from 'lucide-react';
import { ModalPortal } from '@/components/common/ModalPortal';
import { FormErrorBanner } from '@/components/common/FormErrorBanner';
import { registerMemoryCacheClearer, awaitLocalCommit } from '@/data/sync/dataWipeService';

const projectRepo = new FirestoreProjectRepository();
const contactRepo = new FirestoreContactRepository();
const accountRepo = new FirestoreAccountRepository();
const transactionRepo = new FirestoreTransactionRepository();
const obligationRepo = new FirestoreObligationRepository();
const paymentRepo = new FirestorePaymentRepository();

export type EntryType = 'expense' | 'income' | 'obligation' | 'payment';

interface QuickAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialEntryType?: EntryType;
  lockEntryType?: boolean;
  editingBill?: Obligation | null;
}

// In-memory cache for instant modal dropdown population (< 1ms)
let cachedQuickAddData: {
  userId: string;
  projects: Project[];
  contacts: Contact[];
  accounts: Account[];
  obligations: Obligation[];
} | null = null;
registerMemoryCacheClearer(() => {
  cachedQuickAddData = null;
});

export const QuickAddModal: React.FC<QuickAddModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialEntryType = 'expense',
  lockEntryType = false,
  editingBill = null,
}) => {
  const { user } = useAuth();
  const { showSnackbar } = useSnackbar();
  const userId = user?.uid || 'guest-user';

  const isEditingBill = Boolean(editingBill);
  const isTabLocked = lockEntryType || isEditingBill;
  const [entryType, setEntryType] = useState<EntryType>(
    isEditingBill ? 'obligation' : initialEntryType
  );
  const [projects, setProjects] = useState<Project[]>(() => {
    return cachedQuickAddData && cachedQuickAddData.userId === userId ? cachedQuickAddData.projects : [];
  });
  const [contacts, setContacts] = useState<Contact[]>(() => {
    return cachedQuickAddData && cachedQuickAddData.userId === userId ? cachedQuickAddData.contacts : [];
  });
  const [accounts, setAccounts] = useState<Account[]>(() => {
    return cachedQuickAddData && cachedQuickAddData.userId === userId ? cachedQuickAddData.accounts : [];
  });
  const [obligations, setObligations] = useState<Obligation[]>(() => {
    return cachedQuickAddData && cachedQuickAddData.userId === userId ? cachedQuickAddData.obligations : [];
  });

  // Common fields
  const [title, setTitle] = useState<string>('');
  const [amountStr, setAmountStr] = useState<string>('');
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState<string>('');

  // Project & contact relation
  const [projectId, setProjectId] = useState<string>('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [contactId, setContactId] = useState<string>('');
  const [accountId, setAccountId] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [selectedBillId, setSelectedBillId] = useState<string>('');

  // Material purchase specific
  const [itemName, setItemName] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('');
  const [unit, setUnit] = useState<string>('');
  const [unitPriceStr, setUnitPriceStr] = useState<string>('');

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    if (editingBill) {
      setEntryType('obligation');
      setTitle(editingBill.title || '');
      setItemName(editingBill.materialDetails?.itemName || editingBill.title || '');
      const major = Money.toMajorString(editingBill.totalAmountMinor);
      setAmountStr(major.endsWith('.00') ? major.slice(0, -3) : major);
      setDate(editingBill.date || new Date().toISOString().slice(0, 10));
      setProjectId(editingBill.projectId || '');
      setContactId(editingBill.contactId || '');
      setNotes(editingBill.notes || '');
      if (editingBill.materialDetails) {
        setQuantity(
          editingBill.materialDetails.quantity > 0
            ? String(editingBill.materialDetails.quantity)
            : ''
        );
        setUnit(editingBill.materialDetails.unit || '');
        if (editingBill.materialDetails.unitPriceMinor > 0) {
          const upMajor = Money.toMajorString(editingBill.materialDetails.unitPriceMinor);
          setUnitPriceStr(upMajor.endsWith('.00') ? upMajor.slice(0, -3) : upMajor);
        } else {
          setUnitPriceStr('');
        }
      } else {
        setQuantity('');
        setUnit('');
        setUnitPriceStr('');
      }
    } else {
      setEntryType(initialEntryType);
    }

    Promise.all([
      projectRepo.list(userId),
      contactRepo.list(userId),
      accountRepo.list(userId),
      obligationRepo.list(userId),
    ]).then(([prjs, cnts, accs, obls]) => {
      setProjects(prjs);
      setContacts(cnts);
      setAccounts(accs);
      setObligations(obls);
      cachedQuickAddData = { userId, projects: prjs, contacts: cnts, accounts: accs, obligations: obls };
      if (accs.length > 0 && !accountId) {
        setAccountId(accs[0].id);
      }
    });
  }, [isOpen, userId, editingBill?.id, initialEntryType]);

  if (!isOpen) return null;

  const openPayableBills = obligations.filter(
    (o) =>
      !o.isDeleted &&
      o.direction === 'payable' &&
      o.status !== 'voided' &&
      o.status !== 'paid' &&
      o.remainingAmountMinor > 0
  );

  const selectedBill =
    entryType === 'payment' && selectedBillId
      ? openPayableBills.find((b) => b.id === selectedBillId) ?? null
      : null;

  const isProjectLockedToBill = Boolean(selectedBill);
  const isContactLockedToBill = Boolean(selectedBill && selectedBill.contactId);

  const handleSelectBill = (billId: string) => {
    setSelectedBillId(billId);
    if (!billId) return;
    const bill = openPayableBills.find((b) => b.id === billId);
    if (!bill) return;

    // Auto-fill bill-owned fields (Amount, Project, Contact) without touching Account, Date, Method, or Notes
    const major = Money.toMajorString(bill.remainingAmountMinor);
    setAmountStr(major.endsWith('.00') ? major.slice(0, -3) : major);
    setProjectId(bill.projectId || '');
    if (bill.contactId) {
      setContactId(bill.contactId);
    }
  };

  const paymentAmountMinorPreview = (() => {
    const val = parseFloat(amountStr) || 0;
    return val > 0 ? Money.fromMajor(val).minorUnits : 0;
  })();

  const billSettlementHint = (() => {
    if (!selectedBill || paymentAmountMinorPreview <= 0) return null;
    const rem = selectedBill.remainingAmountMinor;
    if (paymentAmountMinorPreview < rem) {
      return {
        text: `Partial — ${Money.format(rem - paymentAmountMinorPreview)} will remain`,
        tone: 'text-amber-600 dark:text-amber-400',
      };
    }
    if (paymentAmountMinorPreview === rem) {
      return {
        text: 'Full settlement — marks bill Paid',
        tone: 'text-emerald-600 dark:text-emerald-400',
      };
    }
    return {
      text: `Exceeds remaining balance by ${Money.format(paymentAmountMinorPreview - rem)}`,
      tone: 'text-rose-600 dark:text-rose-400',
    };
  })();

  // Auto-calculate Total Amount from Qty x Unit Price on the Bill tab using integer minor units
  const syncBillTotal = (nextQtyStr: string, nextUnitPriceStr: string) => {
    const qtyVal = Number(nextQtyStr);
    const unitPriceVal = Number(nextUnitPriceStr);
    if (!Number.isFinite(qtyVal) || !Number.isFinite(unitPriceVal) || qtyVal <= 0 || unitPriceVal <= 0) {
      return;
    }
    const unitPriceMinor = Money.fromMajor(unitPriceVal).minorUnits;
    const totalMinor = Math.round(qtyVal * unitPriceMinor);
    const formatted = Money.toMajorString(totalMinor);
    setAmountStr(formatted.endsWith('.00') ? formatted.slice(0, -3) : formatted);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const amountVal = parseFloat(amountStr) || 0;
    const amountMinor = Math.round(amountVal * 100);

    if (amountMinor <= 0 && entryType !== 'obligation') {
      setError('Amount must be greater than zero.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const combinedNotes =
        title.trim() && notes.trim()
          ? `${title.trim()} — ${notes.trim()}`
          : title.trim() || notes.trim() || undefined;

      if (entryType === 'expense') {
        if (!accountId) throw new Error('Please select an account for payment.');
        const tx = DomainUseCases.recordExpense({
          scope: projectId ? 'project' : 'personal',
          projectId: projectId || undefined,
          accountId,
          categoryId: !projectId && categoryId ? categoryId : undefined,
          amountMinor,
          date,
          notes: combinedNotes,
        });

        const acc = accounts.find((a) => a.id === accountId);
        const writes: Promise<unknown>[] = [transactionRepo.create(userId, tx)];
        if (acc) {
          writes.push(accountRepo.updateBalance(userId, accountId, acc.currentBalanceMinor - amountMinor));
        }
        await awaitLocalCommit(Promise.all(writes));
      } else if (entryType === 'income') {
        if (!accountId) throw new Error('Please select an account to deposit into.');
        const tx = DomainUseCases.recordIncome({
          scope: projectId ? 'project' : 'personal',
          projectId: projectId || undefined,
          accountId,
          contactId: contactId || undefined,
          amountMinor,
          date,
          notes: combinedNotes,
        });

        const acc = accounts.find((a) => a.id === accountId);
        const writes: Promise<unknown>[] = [transactionRepo.create(userId, tx)];
        if (acc) {
          writes.push(accountRepo.updateBalance(userId, accountId, acc.currentBalanceMinor + amountMinor));
        }
        await awaitLocalCommit(Promise.all(writes));
      } else if (entryType === 'obligation') {
        if (!title.trim() && !itemName.trim()) throw new Error('Obligation title is required.');
        const unitPriceVal = Number(unitPriceStr) || 0;
        const unitPriceMinor = unitPriceVal > 0 ? Money.fromMajor(unitPriceVal).minorUnits : 0;
        const qtyVal = Number(quantity) || 0;
        const totalMinor =
          amountMinor > 0 ? amountMinor : Math.round(unitPriceMinor * (qtyVal || 1));

        if (totalMinor <= 0) throw new Error('Total obligation amount must be greater than zero.');

        const hasMaterialDetails =
          qtyVal > 0 || unitPriceMinor > 0 || Boolean(unit.trim());
        const materialDetails = hasMaterialDetails
          ? {
              itemName: (itemName.trim() || title.trim()),
              quantity: qtyVal > 0 ? qtyVal : 1,
              unit: unit.trim() || 'units',
              unitPriceMinor,
            }
          : undefined;

        if (editingBill) {
          const alreadyPaidMinor = editingBill.allocatedAmountMinor || 0;
          if (totalMinor < alreadyPaidMinor) {
            throw new Error(
              `Total cannot be less than the ${Money.format(alreadyPaidMinor)} already paid toward this bill.`
            );
          }

          const newRemainingMinor = totalMinor - alreadyPaidMinor;
          const newStatus: ObligationStatus =
            newRemainingMinor === 0
              ? 'paid'
              : alreadyPaidMinor > 0
                ? 'partially_paid'
                : 'unpaid';

          await awaitLocalCommit(
            obligationRepo.update(userId, editingBill.id, {
              title: title.trim() || `${qtyVal || 1} ${unit.trim() || 'units'} of ${itemName.trim()}`,
              date: date || editingBill.date,
              totalAmountMinor: totalMinor,
              remainingAmountMinor: newRemainingMinor,
              status: newStatus,
              projectId: projectId || undefined,
              contactId: contactId || undefined,
              materialDetails,
              notes: notes.trim() || undefined,
            })
          );
        } else {
          const obl = DomainUseCases.createPurchaseObligation({
            projectId: projectId || undefined,
            contactId: contactId || undefined,
            title: title.trim() || `${qtyVal || 1} ${unit} of ${itemName}`,
            date,
            totalAmountMinor: totalMinor,
            materialDetails,
            notes: notes.trim() || undefined,
          });

          await awaitLocalCommit(obligationRepo.create(userId, obl));
        }
      } else if (entryType === 'payment') {
        if (!accountId) throw new Error('Please select an account for payment.');
        if (!contactId && !selectedBill) throw new Error('Please select a recipient contact.');
        if (selectedBill && amountMinor > selectedBill.remainingAmountMinor) {
          throw new Error(
            `Payment cannot exceed the remaining balance of ${Money.format(selectedBill.remainingAmountMinor)}.`
          );
        }

        const basePayment = DomainUseCases.recordOutgoingPayment({
          accountId,
          contactId: contactId || selectedBill?.contactId || undefined,
          projectId: selectedBill ? selectedBill.projectId : projectId || undefined,
          amountMinor,
          date,
          method: paymentMethod,
          notes: selectedBill
            ? notes.trim() || `Settlement for ${selectedBill.title}`
            : combinedNotes,
        });

        const acc = accounts.find((a) => a.id === accountId);
        const writes: Promise<unknown>[] = [];

        if (selectedBill) {
          const { updatedObligation, updatedPayment, allocation } =
            DomainUseCases.allocatePayment(selectedBill, basePayment);
          writes.push(paymentRepo.create(userId, updatedPayment, [allocation]));
          writes.push(
            obligationRepo.update(userId, updatedObligation.id, {
              allocatedAmountMinor: updatedObligation.allocatedAmountMinor,
              remainingAmountMinor: updatedObligation.remainingAmountMinor,
              status: updatedObligation.status,
            })
          );
        } else {
          writes.push(paymentRepo.create(userId, basePayment));
        }

        if (acc) {
          writes.push(accountRepo.updateBalance(userId, accountId, acc.currentBalanceMinor - amountMinor));
        }
        await awaitLocalCommit(Promise.all(writes));
      }

      setTitle('');
      setAmountStr('');
      setNotes('');
      setCategoryId('');
      setSelectedBillId('');
      setItemName('');
      setUnitPriceStr('');
      showSnackbar({
        message: isEditingBill
          ? 'Bill updated.'
          : entryType === 'income'
            ? 'Funds added to account.'
            : entryType === 'payment' && selectedBill
              ? 'Bill payment recorded.'
              : 'Entry recorded.',
        tone: 'success',
      });
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to record entry');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalPortal isOpen={isOpen}>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/20 dark:bg-black/60 backdrop-blur-sm animate-fade-in overflow-y-auto overflow-x-hidden overscroll-none">
        <div className="w-full max-w-md p-4 sm:p-6 rounded-3xl space-y-4 sm:space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden box-border bg-[var(--lg-surface)] border border-[var(--lg-surface-edge)] backdrop-blur-2xl">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-extrabold text-[var(--lg-foreground)]">
              {isEditingBill
                ? 'Edit Bill'
                : isTabLocked && entryType === 'obligation'
                  ? 'New Bill'
                  : 'Record Financial Entry'}
            </h3>
            <button
              onClick={onClose}
              className="p-1 rounded-full text-[var(--lg-muted)] hover:text-[var(--lg-foreground)]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Glisse Segmented Control for entry type */}
          {!isTabLocked && (
            <div className="flex justify-center w-full py-2 overflow-hidden">
              <SegmentedControl
                items={[
                  { value: 'expense', label: 'Expense' },
                  { value: 'income', label: 'Income' },
                  { value: 'obligation', label: 'Bill' },
                  { value: 'payment', label: 'Payment' },
                ]}
                value={entryType}
                onValueChange={(val) => {
                  if (val) setEntryType(val as EntryType);
                }}
                style={{ '--lg-tab-width': 'clamp(76px, 21vw, 94px)' } as React.CSSProperties}
              />
            </div>
          )}

        <div>
          <FormErrorBanner error={error} onDismiss={() => setError(null)} />

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Obligation / Material Details (persistent DOM for 0ms lag-free tab switching) */}
          <div className={entryType === 'obligation' ? 'space-y-3' : 'hidden'}>
            <div>
              <label className="block text-[11px] font-semibold text-[var(--lg-muted)] uppercase tracking-wider mb-1">
                Item Description *
              </label>
              <Input
                placeholder="Cement, steel"
                value={title}
                onValueChange={(val) => {
                  setTitle(val);
                  setItemName(val);
                }}
                className="!max-w-none"
                required={entryType === 'obligation'}
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-[var(--lg-muted)] uppercase tracking-wider mb-1 min-h-[1.75rem] flex items-end">
                  Qty
                </label>
                <Input
                  type="number"
                  placeholder="100"
                  value={quantity}
                  onValueChange={(val) => {
                    setQuantity(val);
                    syncBillTotal(val, unitPriceStr);
                  }}
                  className="!max-w-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--lg-muted)] uppercase tracking-wider mb-1 min-h-[1.75rem] flex items-end">
                  Unit
                </label>
                <Input
                  placeholder="pcs"
                  value={unit}
                  onValueChange={setUnit}
                  className="!max-w-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--lg-muted)] uppercase tracking-wider mb-1 min-h-[1.75rem] flex items-end">
                  Unit Price
                </label>
                <Input
                  type="number"
                  placeholder="Rs"
                  value={unitPriceStr}
                  onValueChange={(val) => {
                    setUnitPriceStr(val);
                    syncBillTotal(quantity, val);
                  }}
                  className="!max-w-none"
                />
              </div>
            </div>
          </div>

          {/* Standard Memo for Expense, Income, and Standalone Payment (hidden for Bills & Bill Payments) */}
          <div className={entryType !== 'obligation' && !selectedBill ? 'block' : 'hidden'}>
            <label className="block text-[11px] font-semibold text-[var(--lg-muted)] uppercase tracking-wider mb-1">
              Description / Memo *
            </label>
            <Input
              placeholder={
                entryType === 'income'
                  ? 'Salary, advance'
                  : entryType === 'payment'
                    ? 'Contractor advance, deposit'
                    : 'Fuel, groceries'
              }
              value={title}
              onValueChange={setTitle}
              className="!max-w-none"
              required={entryType !== 'obligation' && !selectedBill}
            />
          </div>

          {/* Amount and Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-[var(--lg-muted)] uppercase tracking-wider mb-1 min-h-[1.75rem] flex items-end">
                Total Amount (Rs) *
              </label>
              <Input
                type="number"
                placeholder="0.00"
                value={amountStr}
                onValueChange={setAmountStr}
                className="!max-w-none"
                required={entryType !== 'obligation'}
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[var(--lg-muted)] uppercase tracking-wider mb-1 min-h-[1.75rem] flex items-end">
                Date
              </label>
              <Input
                type="date"
                value={date}
                onValueChange={setDate}
                icon={<Calendar className="w-4 h-4" />}
                className="!max-w-none"
              />
            </div>
          </div>

          {/* Apply to Open Bill (Payment tab only) */}
          <div className={entryType === 'payment' ? 'block space-y-1' : 'hidden'}>
            <label className="block text-[11px] font-semibold text-[var(--lg-muted)] uppercase tracking-wider">
              Apply to Open Bill
            </label>
            <select
              value={selectedBillId}
              onChange={(e) => handleSelectBill(e.target.value)}
              className="w-full h-10 px-3 rounded-2xl theme-select text-xs font-medium focus:outline-none cursor-pointer"
            >
              <option value="">Select</option>
              {openPayableBills.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title} — {Money.format(b.remainingAmountMinor)} left
                </option>
              ))}
            </select>
            {billSettlementHint && (
              <p className={`text-[11px] font-semibold ${billSettlementHint.tone}`}>
                {billSettlementHint.text}
              </p>
            )}
          </div>

          {/* Project and Account */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-[var(--lg-muted)] uppercase tracking-wider mb-1 min-h-[1.75rem] flex items-end">
                Cost Center / Project
              </label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                disabled={isProjectLockedToBill}
                className={`w-full h-10 px-3 rounded-2xl theme-select text-xs font-medium focus:outline-none ${
                  isProjectLockedToBill ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                }`}
              >
                <option value="">Personal</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {isProjectLockedToBill && (
                <p className="text-[10px] text-[var(--lg-muted)] mt-1">Matched to selected bill</p>
              )}
            </div>

            <div className={entryType !== 'obligation' ? 'block' : 'hidden'}>
              <label className="block text-[11px] font-semibold text-[var(--lg-muted)] uppercase tracking-wider mb-1 min-h-[1.75rem] flex items-end">
                {entryType === 'income' ? 'Deposit Into Account *' : 'Paid From Account *'}
              </label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full h-10 px-3 rounded-2xl theme-select text-xs font-medium focus:outline-none cursor-pointer"
                required={entryType !== 'obligation'}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>

            <div className={entryType === 'obligation' ? 'block' : 'hidden'}>
              <label className="block text-[11px] font-semibold text-[var(--lg-muted)] uppercase tracking-wider mb-1 min-h-[1.75rem] flex items-end">
                Contact
              </label>
              <select
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
                className="w-full h-10 px-3 rounded-2xl theme-select text-xs font-medium focus:outline-none cursor-pointer"
              >
                <option value="">None</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Personal Expense Category (for Personal Category Budgets & Analytics) */}
          <div className={entryType === 'expense' && !projectId ? 'block' : 'hidden'}>
            <label className="block text-[11px] font-semibold text-[var(--lg-muted)] uppercase tracking-wider mb-1">
              Category
            </label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full h-10 px-3 rounded-2xl theme-select text-xs font-medium focus:outline-none cursor-pointer"
            >
              <option value="">Uncategorized</option>
              {PERSONAL_EXPENSE_CATEGORIES.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          {/* Recipient Contact & Payment Method for Payments */}
          <div className={entryType === 'payment' ? 'grid grid-cols-2 gap-3' : 'hidden'}>
            <div>
              <label className="block text-[11px] font-semibold text-[var(--lg-muted)] uppercase tracking-wider mb-1 min-h-[1.75rem] flex items-end">
                Disbursed To Contact {selectedBill ? '' : '*'}
              </label>
              <select
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
                disabled={isContactLockedToBill}
                className={`w-full h-10 px-3 rounded-2xl theme-select text-xs font-medium focus:outline-none ${
                  isContactLockedToBill ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                }`}
                required={entryType === 'payment' && !selectedBill}
              >
                <option value="">Select recipient</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.roles.join(', ')})
                  </option>
                ))}
              </select>
              {isContactLockedToBill && (
                <p className="text-[10px] text-[var(--lg-muted)] mt-1">Matched to selected bill</p>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[var(--lg-muted)] uppercase tracking-wider mb-1 min-h-[1.75rem] flex items-end">
                Payment Method
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="w-full h-10 px-3 rounded-2xl theme-select text-xs font-medium focus:outline-none cursor-pointer"
              >
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="cheque">Cheque</option>
                <option value="mobile_wallet">Mobile Wallet</option>
              </select>
            </div>
          </div>

          {/* Notes / Memo */}
          <div>
            <label className="block text-[11px] font-semibold text-[var(--lg-muted)] uppercase tracking-wider mb-1">
              Notes / Reference
            </label>
            <Input
              placeholder="Add a note"
              value={notes}
              onValueChange={setNotes}
              className="!max-w-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <Button
              variant="glass"
              type="button"
              onClick={onClose}
              className="!text-xs font-semibold"
            >
              Cancel
            </Button>
            <Button
              variant="filled"
              tint="#2563EB"
              type="submit"
              disabled={submitting}
              className="!text-xs font-semibold"
            >
              {submitting
                ? isEditingBill
                  ? 'Saving...'
                  : 'Recording...'
                : isEditingBill
                  ? 'Save Changes'
                  : entryType === 'income'
                    ? 'Add Funds'
                    : 'Record Entry'}
            </Button>
          </div>
          </form>
        </div>
      </div>
    </div>
  </ModalPortal>
);
};
