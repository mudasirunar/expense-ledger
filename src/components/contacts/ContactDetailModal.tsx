import React, { useEffect, useState } from 'react';
import { Contact, Payment } from '@/domain/entities';
import { FirestorePaymentRepository } from '@/data/repositories/firestore';
import { Money } from '@/domain/accounting/money';
import { Button } from 'glisse';
import { CheckCircle2, Clock, X } from 'lucide-react';
import { ModalPortal } from '@/components/common/ModalPortal';

const paymentRepo = new FirestorePaymentRepository();

interface ContactDetailModalProps {
  contact: Contact | null;
  userId: string;
  onClose: () => void;
  /** Optional already-loaded payments list for instant 0ms offline lookup */
  payments?: readonly Payment[];
}

export const ContactDetailModal: React.FC<ContactDetailModalProps> = ({
  contact,
  userId,
  onClose,
  payments,
}) => {
  const [latestPayment, setLatestPayment] = useState<Payment | null>(null);
  const [loadingPayment, setLoadingPayment] = useState<boolean>(false);

  useEffect(() => {
    if (!contact) {
      setLatestPayment(null);
      setLoadingPayment(false);
      return;
    }

    if (payments) {
      const matched = payments
        .filter((p) => !p.isDeleted && p.status !== 'voided' && p.contactId === contact.id)
        .sort((a, b) => {
          const dateCmp = (b.date || '').localeCompare(a.date || '');
          if (dateCmp !== 0) return dateCmp;
          return (b.createdAt || '').localeCompare(a.createdAt || '');
        });
      setLatestPayment(matched[0] ?? null);
      setLoadingPayment(false);
      return;
    }

    let cancelled = false;
    setLoadingPayment(true);
    setLatestPayment(null);

    paymentRepo
      .getLatestByContact(userId, contact.id)
      .then((pay) => {
        if (!cancelled) setLatestPayment(pay);
      })
      .catch(() => {
        if (!cancelled) setLatestPayment(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingPayment(false);
      });

    return () => {
      cancelled = true;
    };
  }, [contact, userId, payments]);

  if (!contact) return null;

  return (
    <ModalPortal isOpen={Boolean(contact)}>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/20 dark:bg-black/60 backdrop-blur-sm animate-fade-in overflow-y-auto overscroll-none"
        onClick={onClose}
      >
        <div
          className="w-full max-w-md p-4 sm:p-6 rounded-3xl space-y-4 sm:space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto box-border bg-[var(--lg-surface)] border border-[var(--lg-surface-edge)] backdrop-blur-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between pb-3 border-b border-[var(--lg-separator)]">
            <div>
              <h3 className="text-lg font-black text-[var(--lg-foreground)]">
                {contact.name}
              </h3>
              {contact.companyName && (
                <p className="text-xs text-[var(--lg-muted)]">{contact.companyName}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-full text-[var(--lg-muted)] hover:text-[var(--lg-foreground)]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4 text-xs">
            {/* Latest Payment Widget */}
            <div className="p-4 rounded-2xl bg-blue-600/10 border border-blue-500/20 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold tracking-wider text-blue-600 dark:text-blue-400 uppercase flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  Latest Payment Record
                </span>
                {latestPayment && (
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Posted
                  </span>
                )}
              </div>

              {loadingPayment ? (
                <div className="h-6 bg-[var(--lg-muted)]/20 rounded animate-pulse w-1/2" />
              ) : latestPayment ? (
                <div>
                  <div className="text-xl font-black text-[var(--lg-foreground)] tabular-nums">
                    {Money.format(latestPayment.amountMinor)}
                  </div>
                  <div className="flex items-center flex-wrap gap-3 text-[11px] text-[var(--lg-muted)] mt-1">
                    <span>Date: {latestPayment.date}</span>
                    <span>Method: {latestPayment.method.replace('_', ' ')}</span>
                    {latestPayment.referenceNumber && (
                      <span>Ref: {latestPayment.referenceNumber}</span>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-[var(--lg-muted)]">
                  No payment history recorded for this contact yet.
                </p>
              )}
            </div>

            {/* Roles */}
            <div>
              <span className="text-[10px] font-bold text-[var(--lg-muted)] uppercase tracking-wider block mb-1.5">
                Assigned Roles
              </span>
              <div className="flex flex-wrap gap-1">
                {contact.roles.map((r) => (
                  <span
                    key={r}
                    className="px-2.5 py-1 rounded-full text-xs font-semibold bg-[var(--lg-muted)]/10 text-[var(--lg-foreground)] capitalize"
                  >
                    {r}
                  </span>
                ))}
              </div>
            </div>

            {contact.phone && (
              <div className="p-3 rounded-xl bg-[var(--lg-muted)]/5 flex items-center justify-between">
                <span className="text-[11px] text-[var(--lg-muted)]">Phone</span>
                <a
                  href={`tel:${contact.phone}`}
                  className="text-xs font-bold text-blue-600 dark:text-blue-400"
                >
                  {contact.phone}
                </a>
              </div>
            )}

            {contact.email && (
              <div className="p-3 rounded-xl bg-[var(--lg-muted)]/5 flex items-center justify-between gap-2">
                <span className="text-[11px] text-[var(--lg-muted)]">Email</span>
                <a
                  href={`mailto:${contact.email}`}
                  className="text-xs font-bold text-blue-600 dark:text-blue-400 truncate"
                >
                  {contact.email}
                </a>
              </div>
            )}
          </div>

          <div className="flex justify-end pt-2 border-t border-[var(--lg-separator)]">
            <Button
              variant="glass"
              onClick={onClose}
              className="!text-xs font-semibold"
            >
              Close
            </Button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};
