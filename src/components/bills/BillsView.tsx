import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  FileText,
  Pencil,
  Plus,
} from 'lucide-react';
import { Button, Glass } from 'glisse';
import { useAuth } from '@/app/providers/AuthProvider';
import {
  FirestoreAccountRepository,
  FirestoreContactRepository,
  FirestoreObligationRepository,
  FirestorePaymentRepository,
  FirestoreProjectRepository,
} from '@/data/repositories/firestore';
import { Account, Allocation, Contact, Obligation, Payment, Project } from '@/domain/entities';
import { Money } from '@/domain/accounting/money';
import {
  formatShortInstallmentDate,
  resolveBillPaymentSummary,
} from '@/domain/accounting/billPaymentsHelper';
import { registerMemoryCacheClearer } from '@/data/sync/dataWipeService';
import { BillDetailView } from './BillDetailView';
import { PayBillModal } from './PayBillModal';
import { EditBillModal } from './EditBillModal';
import { QuickAddModal } from '@/components/entry/QuickAddModal';

const accountRepo = new FirestoreAccountRepository();
const contactRepo = new FirestoreContactRepository();
const projectRepo = new FirestoreProjectRepository();
const obligationRepo = new FirestoreObligationRepository();
const paymentRepo = new FirestorePaymentRepository();

interface CachedBillsState {
  userId: string;
  accounts: Account[];
  contacts: Contact[];
  projects: Project[];
  obligations: Obligation[];
  payments: Payment[];
  allocations: Allocation[];
}

let cachedBills: CachedBillsState | null = null;
registerMemoryCacheClearer(() => {
  cachedBills = null;
});

export type BillsFilter = 'open' | 'unpaid' | 'partially_paid' | 'paid' | 'all';

interface BillsViewProps {
  onBack: () => void;
  initialFilter?: BillsFilter;
  selectedBillId?: string | null;
  onSelectBill?: (billId: string) => void;
  onCloseBillDetail?: () => void;
}

export const BillsView: React.FC<BillsViewProps> = ({
  onBack,
  initialFilter = 'open',
  selectedBillId: controlledBillId,
  onSelectBill,
  onCloseBillDetail,
}) => {
  const { user } = useAuth();
  const userId = user?.uid || 'guest-user';

  const hasWarmCache = Boolean(cachedBills && cachedBills.userId === userId);
  const [filter, setFilter] = useState<BillsFilter>(initialFilter);
  const [accounts, setAccounts] = useState<Account[]>(() =>
    hasWarmCache ? cachedBills!.accounts : []
  );
  const [contacts, setContacts] = useState<Contact[]>(() =>
    hasWarmCache ? cachedBills!.contacts : []
  );
  const [projects, setProjects] = useState<Project[]>(() =>
    hasWarmCache ? cachedBills!.projects : []
  );
  const [obligations, setObligations] = useState<Obligation[]>(() =>
    hasWarmCache ? cachedBills!.obligations : []
  );
  const [payments, setPayments] = useState<Payment[]>(() =>
    hasWarmCache ? cachedBills!.payments : []
  );
  const [allocations, setAllocations] = useState<Allocation[]>(() =>
    hasWarmCache ? cachedBills!.allocations : []
  );
  const [loading, setLoading] = useState<boolean>(() => !hasWarmCache);

  const [localSelectedBillId, setLocalSelectedBillId] = useState<string | null>(null);
  const selectedBillId =
    controlledBillId !== undefined ? controlledBillId : localSelectedBillId;
  const openBillDetail = (billId: string) => {
    if (onSelectBill) onSelectBill(billId);
    else setLocalSelectedBillId(billId);
  };
  const closeBillDetail = () => {
    if (onCloseBillDetail) onCloseBillDetail();
    else setLocalSelectedBillId(null);
  };
  const [payingBill, setPayingBill] = useState<Obligation | null>(null);
  const [editingBill, setEditingBill] = useState<Obligation | null>(null);
  const [isAddBillOpen, setIsAddBillOpen] = useState<boolean>(false);

  const chipRowRef = useRef<HTMLDivElement>(null);
  const chipRefs = useRef<Map<BillsFilter, HTMLButtonElement>>(new Map());

  useEffect(() => {
    const row = chipRowRef.current;
    const chip = chipRefs.current.get(filter);
    if (!row || !chip) return;
    const targetLeft = Math.max(0, chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2);
    if (typeof row.scrollTo === 'function') {
      row.scrollTo({ left: targetLeft, behavior: 'smooth' });
    } else {
      row.scrollLeft = targetLeft;
    }
  }, [filter]);

  useEffect(() => {
    const ensureCache = (): CachedBillsState => {
      if (!cachedBills || cachedBills.userId !== userId) {
        cachedBills = {
          userId,
          accounts: [],
          contacts: [],
          projects: [],
          obligations: [],
          payments: [],
          allocations: [],
        };
      }
      return cachedBills;
    };

    const unsubs: Array<() => void> = [];

    if (accountRepo.subscribe) {
      unsubs.push(
        accountRepo.subscribe(
          userId,
          (accs) => {
            setAccounts(accs);
            ensureCache().accounts = accs;
          },
          (err) => console.warn('[Bills] Account subscribe:', err)
        )
      );
    }

    if (contactRepo.subscribe) {
      unsubs.push(
        contactRepo.subscribe(
          userId,
          (cnts) => {
            setContacts(cnts);
            ensureCache().contacts = cnts;
          },
          (err) => console.warn('[Bills] Contact subscribe:', err)
        )
      );
    }

    unsubs.push(
      projectRepo.subscribe(
        userId,
        (prjs) => {
          setProjects(prjs);
          ensureCache().projects = prjs;
        },
        (err) => console.warn('[Bills] Project subscribe:', err)
      )
    );

    unsubs.push(
      obligationRepo.subscribe(
        userId,
        (obls) => {
          setObligations(obls);
          ensureCache().obligations = obls;
          setLoading(false);
        },
        (err) => {
          console.warn('[Bills] Obligation subscribe:', err);
          setLoading(false);
        }
      )
    );

    unsubs.push(
      paymentRepo.subscribe(
        userId,
        (pays) => {
          setPayments(pays);
          ensureCache().payments = pays;
        },
        (err) => console.warn('[Bills] Payment subscribe:', err)
      )
    );

    unsubs.push(
      paymentRepo.subscribeAllocations(
        userId,
        (allocs) => {
          setAllocations(allocs);
          ensureCache().allocations = allocs;
        },
        (err) => console.warn('[Bills] Allocation subscribe:', err)
      )
    );

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [userId]);

  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const contactMap = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);

  const activeBills = useMemo(
    () =>
      obligations
        .filter((o) => !o.isDeleted && o.direction === 'payable' && o.status !== 'voided')
        .sort((a, b) => {
          // Open bills first, then latest date
          const aOpen = a.status !== 'paid' && a.remainingAmountMinor > 0 ? 0 : 1;
          const bOpen = b.status !== 'paid' && b.remainingAmountMinor > 0 ? 0 : 1;
          if (aOpen !== bOpen) return aOpen - bOpen;
          return (b.date || '').localeCompare(a.date || '');
        }),
    [obligations]
  );

  const counts = useMemo(() => {
    let open = 0;
    let unpaid = 0;
    let partiallyPaid = 0;
    let paid = 0;
    let totalRemainingMinor = 0;
    let totalPaidMinor = 0;

    for (const b of activeBills) {
      totalPaidMinor += b.allocatedAmountMinor || 0;
      if (b.status === 'paid' || b.remainingAmountMinor <= 0) {
        paid += 1;
      } else {
        open += 1;
        totalRemainingMinor += b.remainingAmountMinor || 0;
        if (b.status === 'partially_paid') partiallyPaid += 1;
        else unpaid += 1;
      }
    }

    return {
      open,
      unpaid,
      partially_paid: partiallyPaid,
      paid,
      all: activeBills.length,
      totalRemainingMinor,
      totalPaidMinor,
    };
  }, [activeBills]);

  const filteredBills = useMemo(() => {
    if (filter === 'all') return activeBills;
    if (filter === 'open') {
      return activeBills.filter((b) => b.status !== 'paid' && b.remainingAmountMinor > 0);
    }
    if (filter === 'paid') {
      return activeBills.filter((b) => b.status === 'paid' || b.remainingAmountMinor <= 0);
    }
    return activeBills.filter((b) => b.status === filter);
  }, [activeBills, filter]);

  const selectedBill = useMemo(
    () => (selectedBillId ? obligations.find((o) => o.id === selectedBillId) ?? null : null),
    [selectedBillId, obligations]
  );

  return (
    <>
      {selectedBill ? (
        <BillDetailView
          bill={selectedBill}
          accounts={accounts}
          projects={projects}
          contacts={contacts}
          payments={payments}
          allocations={allocations}
          onBack={closeBillDetail}
          onPayBill={(b) => setPayingBill(b)}
          onEditBill={(b) => setEditingBill(b)}
        />
      ) : (
        <div className="flex flex-col app-screen w-full bg-[#E2DDD5] dark:bg-background text-slate-900 dark:text-slate-100 overflow-hidden font-sans transition-colors duration-200">
      <div className="flex-1 overflow-y-auto scroll-container overscroll-y-contain">
        <div
          className="w-full select-none pointer-events-none"
          style={{ height: 'var(--top-spacer, env(safe-area-inset-top, 0px))' }}
        />

        <header className="w-full px-4 py-2.5 flex items-center justify-between gap-3 select-none">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="glass"
              aria-label="Go back"
              onClick={onBack}
              icon={<ChevronLeft className="!w-6 !h-6" />}
              className="!p-0 !rounded-full !w-[44px] !h-[44px] flex-shrink-0"
            />
            <h1 className="text-xl font-extrabold text-[var(--lg-foreground)] tracking-tight truncate">
              Bills & Payables
            </h1>
          </div>

          <Button
            variant="filled"
            tint="#2563EB"
            aria-label="Add bill"
            onClick={() => setIsAddBillOpen(true)}
            icon={<Plus className="!w-5 !h-5 stroke-[2.5]" />}
            className="!p-0 !rounded-full !w-[44px] !h-[44px] shadow-lg shadow-blue-600/30 flex-shrink-0"
          />
        </header>

        <main className="max-w-md mx-auto w-full px-4 pt-2 pb-12 space-y-5">
          {/* Summary Glass Card */}
          <Glass className="p-5 rounded-3xl space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--lg-muted)]">
                  Total Outstanding Payables
                </p>
                <p className="text-2xl sm:text-3xl font-black tracking-tight tabular-nums text-[var(--lg-foreground)] mt-1">
                  {Money.format(counts.totalRemainingMinor)}
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold tabular-nums whitespace-nowrap flex-shrink-0 bg-rose-500/15 text-rose-600 dark:text-rose-400">
                {counts.open} {counts.open === 1 ? 'open' : 'open'}
              </span>
            </div>

            <div className="flex items-center justify-between text-[11px] text-[var(--lg-muted)] tabular-nums">
              <span>Settled: {Money.format(counts.totalPaidMinor)}</span>
              <span>
                {counts.paid} of {counts.all} paid
              </span>
            </div>
          </Glass>

          {/* Status Filter Chips */}
          <div
            ref={chipRowRef}
            className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5"
          >
            {(
              [
                { id: 'open', label: `Open (${counts.open})` },
                { id: 'unpaid', label: `Unpaid (${counts.unpaid})` },
                { id: 'partially_paid', label: `Partial (${counts.partially_paid})` },
                { id: 'paid', label: `Paid (${counts.paid})` },
                { id: 'all', label: `All (${counts.all})` },
              ] as Array<{ id: BillsFilter; label: string }>
            ).map((chip) => {
              const active = filter === chip.id;
              return (
                <button
                  key={chip.id}
                  ref={(el) => {
                    if (el) chipRefs.current.set(chip.id, el);
                    else chipRefs.current.delete(chip.id);
                  }}
                  type="button"
                  onClick={() => setFilter(chip.id)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0 ${
                    active
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/25'
                      : 'bg-[var(--lg-glass)] text-[var(--lg-muted)] border border-[var(--lg-edge)] hover:text-[var(--lg-foreground)]'
                  }`}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>

          {/* Flat-on-screen Bills List */}
          {loading ? (
            <div className="space-y-4 animate-pulse pt-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 rounded-2xl bg-[var(--lg-muted)]/12" />
              ))}
            </div>
          ) : filteredBills.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <FileText className="w-9 h-9 mx-auto text-[var(--lg-muted)] opacity-50" />
              <p className="text-sm font-bold text-[var(--lg-foreground)]">
                {filter === 'open' ? 'All bills settled!' : 'No bills in this view'}
              </p>
              <p className="text-xs text-[var(--lg-muted)] max-w-[260px] mx-auto">
                {filter === 'open'
                  ? 'You have no unpaid or partially paid bills right now.'
                  : 'Try another filter or record a new Bill from the + button.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--lg-separator)]">
              {filteredBills.map((bill) => {
                const contactName = bill.contactId ? contactMap.get(bill.contactId)?.name : undefined;
                const projectName = bill.projectId ? projectMap.get(bill.projectId)?.name : undefined;
                const isOpen = bill.status !== 'paid' && bill.remainingAmountMinor > 0;
                const isPartial = isOpen && bill.allocatedAmountMinor > 0;
                const paidPct =
                  bill.totalAmountMinor > 0
                    ? Math.min(100, Math.round((bill.allocatedAmountMinor * 100) / bill.totalAmountMinor))
                    : 0;
                const paymentSummary = resolveBillPaymentSummary(
                  bill.id,
                  payments,
                  allocations,
                  accounts
                );
                const shortDate = formatShortInstallmentDate(bill.date);

                return (
                  <div
                    key={bill.id}
                    onClick={() => openBillDetail(bill.id)}
                    className="py-4 first:pt-1 last:pb-2 space-y-2.5 cursor-pointer active:opacity-80 transition-opacity"
                  >
                    {/* Row 1: Title + Meta on left, Hero Amount + Status on right */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[15px] font-bold text-[var(--lg-foreground)] truncate leading-snug">
                          {bill.title}
                        </p>
                        <p className="text-xs text-[var(--lg-muted)] truncate mt-0.5">
                          {[contactName, projectName || 'Personal', shortDate]
                            .filter(Boolean)
                            .join(' • ')}
                        </p>
                      </div>

                      <div className="text-right flex-shrink-0 tabular-nums">
                        <p
                          className={`text-[15px] font-extrabold leading-snug ${
                            isOpen
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {isOpen
                            ? Money.format(bill.remainingAmountMinor)
                            : Money.format(bill.totalAmountMinor)}
                        </p>
                        <p
                          className={`text-[10px] font-bold uppercase tracking-wider mt-0.5 ${
                            !isOpen
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : isPartial
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-rose-600/80 dark:text-rose-400/80'
                          }`}
                        >
                          {!isOpen ? 'Paid' : isPartial ? `Partial • ${paidPct}%` : 'Unpaid'}
                        </p>
                      </div>
                    </div>

                    {/* Row 2: Progress bar ONLY when partially paid */}
                    {isPartial && (
                      <div className="space-y-1">
                        <div className="w-full h-1.5 rounded-full bg-[var(--lg-separator)] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-amber-500 transition-all duration-300"
                            style={{ width: `${paidPct}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-[var(--lg-muted)] tabular-nums">
                          <span>Paid {Money.format(bill.allocatedAmountMinor)}</span>
                          <span>Total {Money.format(bill.totalAmountMinor)}</span>
                        </div>
                      </div>
                    )}

                    {/* Row 3: Accounts used (when paid/partial) + clean right-aligned actions */}
                    <div className="flex items-center justify-between gap-3 pt-0.5">
                      <span className="text-[11px] text-[var(--lg-muted)] truncate min-w-0">
                        {paymentSummary.accountsSummary
                          ? `Via ${paymentSummary.accountsSummary}`
                          : ''}
                      </span>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingBill(bill);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold text-[var(--lg-muted)] hover:text-[var(--lg-foreground)] bg-[var(--lg-glass)] border border-[var(--lg-edge)] active:opacity-75 transition-opacity"
                        >
                          <Pencil className="w-3 h-3" />
                          Edit
                        </button>
                        {isOpen && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPayingBill(bill);
                            }}
                            className="inline-flex items-center px-3.5 py-1 rounded-full text-[11px] font-bold bg-blue-600 text-white shadow-sm shadow-blue-600/25 active:opacity-80 transition-opacity"
                          >
                            Pay
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </div>
      )}

      {/* Quick Pay, Edit & Add Bill Modals */}
      <PayBillModal
        bill={payingBill}
        accounts={accounts}
        contactName={payingBill?.contactId ? contactMap.get(payingBill.contactId)?.name : undefined}
        projectName={payingBill?.projectId ? projectMap.get(payingBill.projectId)?.name : undefined}
        onClose={() => setPayingBill(null)}
      />

      <EditBillModal
        bill={editingBill}
        projects={projects}
        contacts={contacts}
        onClose={() => setEditingBill(null)}
      />

      <QuickAddModal
        isOpen={isAddBillOpen}
        initialEntryType="obligation"
        lockEntryType
        onClose={() => setIsAddBillOpen(false)}
      />
    </>
  );
};
