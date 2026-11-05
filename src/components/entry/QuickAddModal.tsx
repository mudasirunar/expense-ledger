import React, { useState, useEffect } from 'react';
import { Project, Contact, Account, PaymentMethod } from '@/domain/entities';
import { 
  FirestoreProjectRepository, 
  FirestoreContactRepository, 
  FirestoreAccountRepository,
  FirestoreTransactionRepository,
  FirestoreObligationRepository,
  FirestorePaymentRepository
} from '@/data/repositories/firestore';
import { DomainUseCases } from '@/domain/usecases';
import { useAuth } from '@/app/providers/AuthProvider';
import { Button, Input, SegmentedControl } from 'glisse';
import { X, AlertCircle } from 'lucide-react';
import { ModalPortal } from '@/components/common/ModalPortal';

const projectRepo = new FirestoreProjectRepository();
const contactRepo = new FirestoreContactRepository();
const accountRepo = new FirestoreAccountRepository();
const transactionRepo = new FirestoreTransactionRepository();
const obligationRepo = new FirestoreObligationRepository();
const paymentRepo = new FirestorePaymentRepository();

interface QuickAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

type EntryType = 'expense' | 'obligation' | 'payment';

// In-memory cache for instant modal dropdown population (< 1ms)
let cachedQuickAddData: {
  userId: string;
  projects: Project[];
  contacts: Contact[];
  accounts: Account[];
} | null = null;

export const QuickAddModal: React.FC<QuickAddModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { user } = useAuth();
  const userId = user?.uid || 'guest-user';

  const [entryType, setEntryType] = useState<EntryType>('expense');
  const [projects, setProjects] = useState<Project[]>(() => {
    return cachedQuickAddData && cachedQuickAddData.userId === userId ? cachedQuickAddData.projects : [];
  });
  const [contacts, setContacts] = useState<Contact[]>(() => {
    return cachedQuickAddData && cachedQuickAddData.userId === userId ? cachedQuickAddData.contacts : [];
  });
  const [accounts, setAccounts] = useState<Account[]>(() => {
    return cachedQuickAddData && cachedQuickAddData.userId === userId ? cachedQuickAddData.accounts : [];
  });

  // Common fields
  const [title, setTitle] = useState<string>('');
  const [amountStr, setAmountStr] = useState<string>('');
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState<string>('');

  // Project & contact relation
  const [projectId, setProjectId] = useState<string>('');
  const [contactId, setContactId] = useState<string>('');
  const [accountId, setAccountId] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');

  // Material purchase specific
  const [itemName, setItemName] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('');
  const [unit, setUnit] = useState<string>('bags');
  const [unitPriceStr, setUnitPriceStr] = useState<string>('');

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    Promise.all([
      projectRepo.list(userId),
      contactRepo.list(userId),
      accountRepo.list(userId),
    ]).then(([prjs, cnts, accs]) => {
      setProjects(prjs);
      setContacts(cnts);
      setAccounts(accs);
      cachedQuickAddData = { userId, projects: prjs, contacts: cnts, accounts: accs };
      if (accs.length > 0 && !accountId) {
        setAccountId(accs[0].id);
      }
    });
  }, [isOpen, userId]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountVal = parseFloat(amountStr) || 0;
    const amountMinor = Math.round(amountVal * 100);

    if (amountMinor <= 0 && entryType !== 'obligation') {
      setError('Amount must be greater than zero.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      if (entryType === 'expense') {
        if (!accountId) throw new Error('Please select an account for payment.');
        const tx = DomainUseCases.recordExpense({
          scope: projectId ? 'project' : 'personal',
          projectId: projectId || undefined,
          accountId,
          amountMinor,
          date,
          notes: notes.trim() || undefined,
        });

        await transactionRepo.create(userId, tx);

        // Update account balance
        const acc = accounts.find((a) => a.id === accountId);
        if (acc) {
          await accountRepo.updateBalance(userId, accountId, acc.currentBalanceMinor - amountMinor);
        }
      } else if (entryType === 'obligation') {
        if (!title.trim() && !itemName.trim()) throw new Error('Obligation title is required.');
        const unitPriceVal = parseFloat(unitPriceStr) || 0;
        const qtyVal = parseFloat(quantity) || 1;
        const totalMinor = amountMinor > 0 ? amountMinor : Math.round(unitPriceVal * qtyVal * 100);

        if (totalMinor <= 0) throw new Error('Total obligation amount must be greater than zero.');

        const obl = DomainUseCases.createPurchaseObligation({
          projectId: projectId || undefined,
          contactId: contactId || undefined,
          title: title.trim() || `${quantity} ${unit} of ${itemName}`,
          date,
          totalAmountMinor: totalMinor,
          materialDetails: itemName.trim() ? {
            itemName: itemName.trim(),
            quantity: qtyVal,
            unit: unit.trim() || 'units',
            unitPriceMinor: Math.round(unitPriceVal * 100),
          } : undefined,
          notes: notes.trim() || undefined,
        });

        await obligationRepo.create(userId, obl);
      } else if (entryType === 'payment') {
        if (!accountId) throw new Error('Please select an account for payment.');
        if (!contactId) throw new Error('Please select a recipient contact.');

        const pmt = DomainUseCases.recordOutgoingPayment({
          accountId,
          contactId,
          projectId: projectId || undefined,
          amountMinor,
          date,
          method: paymentMethod,
          notes: notes.trim() || undefined,
        });

        await paymentRepo.create(userId, pmt);

        // Update account balance
        const acc = accounts.find((a) => a.id === accountId);
        if (acc) {
          await accountRepo.updateBalance(userId, accountId, acc.currentBalanceMinor - amountMinor);
        }
      }

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
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/20 dark:bg-black/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
        <div className="w-full max-w-md p-4 sm:p-6 rounded-3xl space-y-4 sm:space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto box-border bg-[var(--lg-surface)] border border-[var(--lg-surface-edge)] backdrop-blur-2xl">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--lg-separator)]">
            <div>
              <h3 className="text-base font-extrabold text-[var(--lg-foreground)]">Record Financial Entry</h3>
              <p className="text-[11px] text-[var(--lg-muted)]">Immediate double-entry ledger capture</p>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-full text-[var(--lg-muted)] hover:text-[var(--lg-foreground)]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Glisse Segmented Control for entry type - exact same implementation as dashboard */}
          <div className="flex justify-center w-full py-2">
            <SegmentedControl
              items={[
                { value: 'expense', label: 'Expense' },
                { value: 'obligation', label: 'Bill / PO' },
                { value: 'payment', label: 'Disbursement' },
              ]}
              value={entryType}
              onValueChange={(val) => {
                if (val) setEntryType(val as EntryType);
              }}
              style={{ '--lg-tab-width': '105px' } as React.CSSProperties}
            />
          </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Obligation / Material Details (persistent DOM for 0ms lag-free tab switching) */}
          <div className={entryType === 'obligation' ? 'space-y-3' : 'hidden'}>
            <div>
              <label className="block text-[11px] font-semibold text-[var(--lg-muted)] uppercase tracking-wider mb-1">
                Item Description *
              </label>
              <Input
                placeholder="e.g. Falcon Cement (Grade 53)"
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
                  onValueChange={setQuantity}
                  className="!max-w-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--lg-muted)] uppercase tracking-wider mb-1 min-h-[1.75rem] flex items-end">
                  Unit
                </label>
                <Input
                  placeholder="bags/tons"
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
                  onValueChange={setUnitPriceStr}
                  className="!max-w-none"
                />
              </div>
            </div>
          </div>

          {/* Standard Memo for Expense and Payment */}
          <div className={entryType !== 'obligation' ? 'block' : 'hidden'}>
            <label className="block text-[11px] font-semibold text-[var(--lg-muted)] uppercase tracking-wider mb-1">
              Description / Memo *
            </label>
            <Input
              placeholder="e.g. Fuel for generator or site lunch"
              value={title}
              onValueChange={setTitle}
              className="!max-w-none"
              required={entryType !== 'obligation'}
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
                className="!max-w-none"
              />
            </div>
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
                className="w-full h-10 px-3 rounded-2xl theme-select text-xs font-medium focus:outline-none cursor-pointer"
              >
                <option value="">Personal / General Overhead</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className={entryType !== 'obligation' ? 'block' : 'hidden'}>
              <label className="block text-[11px] font-semibold text-[var(--lg-muted)] uppercase tracking-wider mb-1 min-h-[1.75rem] flex items-end">
                Paid From Account *
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
                Supplier / Vendor Contact
              </label>
              <select
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
                className="w-full h-10 px-3 rounded-2xl theme-select text-xs font-medium focus:outline-none cursor-pointer"
              >
                <option value="">None / Anonymous</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Recipient Contact & Payment Method for Payments */}
          <div className={entryType === 'payment' ? 'grid grid-cols-2 gap-3' : 'hidden'}>
            <div>
              <label className="block text-[11px] font-semibold text-[var(--lg-muted)] uppercase tracking-wider mb-1 min-h-[1.75rem] flex items-end">
                Disbursed To Contact *
              </label>
              <select
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
                className="w-full h-10 px-3 rounded-2xl theme-select text-xs font-medium focus:outline-none cursor-pointer"
                required={entryType === 'payment'}
              >
                <option value="">Select recipient</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.roles.join(', ')})
                  </option>
                ))}
              </select>
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
              Notes / Reference (Optional)
            </label>
            <Input
              placeholder="e.g. Invoice #982 or site supervisor clearance"
              value={notes}
              onValueChange={setNotes}
              className="!max-w-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[var(--lg-separator)]">
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
              {submitting ? 'Recording...' : 'Record Entry'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  </ModalPortal>
);
};
