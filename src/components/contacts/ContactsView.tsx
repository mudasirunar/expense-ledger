import React, { useState, useEffect } from 'react';
import { Contact, ContactRole, Payment } from '@/domain/entities';
import { FirestoreContactRepository, FirestorePaymentRepository } from '@/data/repositories/firestore';
import { useAuth } from '@/app/providers/AuthProvider';
import { Money } from '@/domain/accounting/money';
import { Glass, Button, Input } from 'glisse';
import { 
  Users, 
  Plus, 
  Phone, 
  X, 
  AlertCircle, 
  Clock, 
  CheckCircle2
} from 'lucide-react';

const contactRepo = new FirestoreContactRepository();
const paymentRepo = new FirestorePaymentRepository();

// In-memory cache for instant (0ms) contact switching
let cachedContacts: { userId: string; data: Contact[] } | null = null;

const ALL_ROLES: ContactRole[] = ['contractor', 'supplier', 'worker', 'customer', 'client', 'other'];

export const ContactsView: React.FC = () => {
  const { user } = useAuth();
  const userId = user?.uid || 'guest-user';

  const [contacts, setContacts] = useState<Contact[]>(() => {
    return cachedContacts && cachedContacts.userId === userId ? cachedContacts.data : [];
  });
  const [loading, setLoading] = useState<boolean>(() => {
    return !(cachedContacts && cachedContacts.userId === userId);
  });
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [latestPayment, setLatestPayment] = useState<Payment | null>(null);
  const [loadingPayment, setLoadingPayment] = useState<boolean>(false);

  // Form state
  const [name, setName] = useState<string>('');
  const [companyName, setCompanyName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [selectedRoles, setSelectedRoles] = useState<ContactRole[]>(['contractor']);
  const [notes, setNotes] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Real-time cache-first synchronization: instant (< 10ms) from local cache
  useEffect(() => {
    let unsub: (() => void) | undefined;

    if (contactRepo.subscribe) {
      unsub = contactRepo.subscribe(
        userId,
        (data) => {
          setContacts(data);
          cachedContacts = { userId, data };
          setLoading(false);
        },
        (err) => {
          console.warn('[Contacts] Subscribe fallback:', err);
          setLoading(false);
        }
      );
    } else {
      contactRepo.list(userId).then((data) => {
        setContacts(data);
        cachedContacts = { userId, data };
        setLoading(false);
      });
    }

    return () => {
      if (unsub) unsub();
    };
  }, [userId]);

  const handleSelectContact = async (contact: Contact) => {
    setSelectedContact(contact);
    setLoadingPayment(true);
    try {
      const p = await paymentRepo.getLatestByContact(userId, contact.id);
      setLatestPayment(p);
    } catch (err) {
      console.warn('[Contacts] Latest payment lookup:', err);
      setLatestPayment(null);
    } finally {
      setLoadingPayment(false);
    }
  };

  const toggleRole = (role: ContactRole) => {
    setSelectedRoles((prev) => 
      prev.includes(role) 
        ? prev.length > 1 ? prev.filter((r) => r !== role) : prev
        : [...prev, role]
    );
  };

  const handleCreateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError('Contact name is required.');
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const newContact: Contact = {
        id: `cnt-${Date.now()}`,
        name: name.trim(),
        companyName: companyName.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        roles: selectedRoles,
        notes: notes.trim() || undefined,
        associatedProjectIds: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await contactRepo.create(userId, newContact);
      setContacts((prev) => [newContact, ...prev]);
      setIsCreateOpen(false);
      resetForm();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to register contact');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setName('');
    setCompanyName('');
    setPhone('');
    setEmail('');
    setSelectedRoles(['contractor']);
    setNotes('');
    setFormError(null);
  };

  return (
    <div className="space-y-4 pb-20">
      {/* Action Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xs font-bold text-[var(--lg-muted)] uppercase tracking-wider">
            Contacts & Directory ({contacts.length})
          </h2>
          <p className="text-[11px] text-[var(--lg-muted)]">
            Contractors, vendors, and laborers across all projects
          </p>
        </div>

        <Button
          variant="filled"
          tint="#2563EB"
          icon={<Plus className="w-3.5 h-3.5 stroke-[2.5]" />}
          onClick={() => setIsCreateOpen(true)}
          className="!text-xs font-semibold !py-1.5 !px-3.5"
        >
          Add Contact
        </Button>
      </div>

      {/* Contacts List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <Glass key={i} className="p-5 rounded-2xl animate-pulse space-y-3">
              <div className="h-4 bg-[var(--lg-muted)]/20 rounded w-1/3"></div>
              <div className="h-3 bg-[var(--lg-muted)]/20 rounded w-1/2"></div>
            </Glass>
          ))}
        </div>
      ) : contacts.length === 0 ? (
        <Glass className="p-8 text-center space-y-3 rounded-2xl">
          <Users className="w-12 h-12 text-[var(--lg-muted)] mx-auto opacity-60" />
          <div>
            <p className="text-sm font-bold text-[var(--lg-foreground)]">No contacts saved yet</p>
            <p className="text-xs text-[var(--lg-muted)] max-w-xs mx-auto mt-1 leading-relaxed">
              Register contractors, cement/steel suppliers, and site workers to track obligations and immediate payment records.
            </p>
          </div>
          <div className="pt-2">
            <Button
              variant="filled"
              tint="#2563EB"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => setIsCreateOpen(true)}
              className="!text-xs font-semibold"
            >
              Add First Contact
            </Button>
          </div>
        </Glass>
      ) : (
        <div className="space-y-3">
          {contacts.map((contact) => (
            <Glass
              key={contact.id}
              onClick={() => handleSelectContact(contact)}
              className="p-4 sm:p-5 rounded-2xl space-y-3 cursor-pointer hover:bg-[var(--lg-glass-active)] transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-[var(--lg-foreground)] text-sm sm:text-base truncate">
                      {contact.name}
                    </span>
                    {contact.companyName && (
                      <span className="text-[11px] text-[var(--lg-muted)] truncate">
                        • {contact.companyName}
                      </span>
                    )}
                  </div>
                  {contact.phone && (
                    <div className="flex items-center gap-1.5 text-xs text-[var(--lg-muted)] mt-1">
                      <Phone className="w-3 h-3 text-[var(--lg-muted)] flex-shrink-0" />
                      <span>{contact.phone}</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-1 justify-end max-w-[140px]">
                  {contact.roles.map((role) => (
                    <span
                      key={role}
                      className="text-[9px] font-bold px-2 py-0.5 rounded-full border border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400 uppercase tracking-wider"
                    >
                      {role}
                    </span>
                  ))}
                </div>
              </div>
            </Glass>
          ))}
        </div>
      )}

      {/* Create Contact Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <Glass className="w-full max-w-md p-6 rounded-3xl space-y-5 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--lg-separator)]">
              <div>
                <h3 className="text-base font-extrabold text-[var(--lg-foreground)]">Register Contact</h3>
                <p className="text-[11px] text-[var(--lg-muted)]">Add a contractor, worker, or supplier</p>
              </div>
              <button
                onClick={() => {
                  setIsCreateOpen(false);
                  resetForm();
                }}
                className="p-1 rounded-full text-[var(--lg-muted)] hover:text-[var(--lg-foreground)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreateContact} className="space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-[var(--lg-muted)] uppercase tracking-wider mb-1.5">
                  Full Name / Contact Name *
                </label>
                <Input
                  placeholder="e.g. Master Aslam"
                  value={name}
                  onValueChange={setName}
                  className="!max-w-none"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--lg-muted)] uppercase tracking-wider mb-1.5">
                  Business / Company Name
                </label>
                <Input
                  placeholder="e.g. Aslam Tile Works"
                  value={companyName}
                  onValueChange={setCompanyName}
                  className="!max-w-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--lg-muted)] uppercase tracking-wider mb-1.5">
                    Phone Number
                  </label>
                  <Input
                    type="tel"
                    placeholder="0300-1234567"
                    value={phone}
                    onValueChange={setPhone}
                    className="!max-w-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--lg-muted)] uppercase tracking-wider mb-1.5">
                    Email Address
                  </label>
                  <Input
                    type="email"
                    placeholder="contact@gmail.com"
                    value={email}
                    onValueChange={setEmail}
                    className="!max-w-none"
                  />
                </div>
              </div>

              {/* Multi-role selection pills */}
              <div>
                <label className="block text-[11px] font-semibold text-[var(--lg-muted)] uppercase tracking-wider mb-2">
                  Roles & Relationship (Multi-select)
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_ROLES.map((role) => {
                    const active = selectedRoles.includes(role);
                    return (
                      <button
                        key={role}
                        type="button"
                        onClick={() => toggleRole(role)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold capitalize transition-all ${
                          active
                            ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30'
                            : 'bg-[var(--lg-muted)]/10 text-[var(--lg-muted)] hover:text-[var(--lg-foreground)]'
                        }`}
                      >
                        {role}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[var(--lg-separator)]">
                <Button
                  variant="glass"
                  type="button"
                  onClick={() => {
                    setIsCreateOpen(false);
                    resetForm();
                  }}
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
                  {submitting ? 'Registering...' : 'Save Contact'}
                </Button>
              </div>
            </form>
          </Glass>
        </div>
      )}

      {/* Contact Profile & Latest Payment Detail Modal */}
      {selectedContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <Glass className="w-full max-w-md p-6 rounded-3xl space-y-5 shadow-2xl">
            <div className="flex items-start justify-between pb-3 border-b border-[var(--lg-separator)]">
              <div>
                <h3 className="text-lg font-black text-[var(--lg-foreground)]">
                  {selectedContact.name}
                </h3>
                {selectedContact.companyName && (
                  <p className="text-xs text-[var(--lg-muted)]">
                    {selectedContact.companyName}
                  </p>
                )}
              </div>
              <button
                onClick={() => setSelectedContact(null)}
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
                  <div className="h-6 bg-[var(--lg-muted)]/20 rounded animate-pulse w-1/2"></div>
                ) : latestPayment ? (
                  <div>
                    <div className="text-xl font-black text-[var(--lg-foreground)] tabular-nums">
                      {Money.format(latestPayment.amountMinor)}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-[var(--lg-muted)] mt-1">
                      <span>Date: {latestPayment.date}</span>
                      <span>Method: {latestPayment.method.replace('_', ' ')}</span>
                      {latestPayment.referenceNumber && <span>Ref: {latestPayment.referenceNumber}</span>}
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
                  {selectedContact.roles.map((r) => (
                    <span
                      key={r}
                      className="px-2.5 py-1 rounded-full text-xs font-semibold bg-[var(--lg-muted)]/10 text-[var(--lg-foreground)] capitalize"
                    >
                      {r}
                    </span>
                  ))}
                </div>
              </div>

              {selectedContact.phone && (
                <div className="p-3 rounded-xl bg-[var(--lg-muted)]/5 flex items-center justify-between">
                  <span className="text-[11px] text-[var(--lg-muted)]">Phone</span>
                  <a href={`tel:${selectedContact.phone}`} className="text-xs font-bold text-blue-600 dark:text-blue-400">
                    {selectedContact.phone}
                  </a>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-[var(--lg-separator)]">
              <Button
                variant="glass"
                onClick={() => setSelectedContact(null)}
                className="!text-xs font-semibold"
              >
                Close
              </Button>
            </div>
          </Glass>
        </div>
      )}
    </div>
  );
};
