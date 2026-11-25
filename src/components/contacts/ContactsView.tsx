import React, { useState, useEffect } from 'react';
import { Contact, ContactRole } from '@/domain/entities';
import { FirestoreContactRepository } from '@/data/repositories/firestore';
import { useAuth } from '@/app/providers/AuthProvider';
import { Glass, Button, Input } from 'glisse';
import { 
  Users, 
  Plus, 
  Phone, 
  X, 
  AlertCircle,
} from 'lucide-react';
import { ModalPortal } from '@/components/common/ModalPortal';
import { ContactDetailModal } from './ContactDetailModal';
import { registerMemoryCacheClearer, awaitLocalCommit } from '@/data/sync/dataWipeService';
import { generateEntityId } from '@/domain/utils/id';

const contactRepo = new FirestoreContactRepository();

// In-memory cache for instant (0ms) contact switching
let cachedContacts: { userId: string; data: Contact[] } | null = null;
registerMemoryCacheClearer(() => {
  cachedContacts = null;
});

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

  const handleSelectContact = (contact: Contact) => {
    setSelectedContact(contact);
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
        id: generateEntityId('cnt'),
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

      await awaitLocalCommit(contactRepo.create(userId, newContact));
      setContacts((prev) =>
        prev.some((c) => c.id === newContact.id) ? prev : [newContact, ...prev]
      );
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
    <div className="space-y-4">
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
        <div className="py-12 flex flex-col items-center justify-center px-4 text-center space-y-3">
          <Users className="w-11 h-11 text-[var(--lg-muted)] mx-auto opacity-50" />
          <div>
            <p className="text-sm font-bold text-[var(--lg-foreground)]">No contacts saved yet</p>
            <p className="text-xs text-[var(--lg-muted)] max-w-xs mx-auto mt-1 leading-relaxed">
              Register contractors, cement/steel suppliers, and site workers to track obligations and immediate payment records.
            </p>
          </div>
          <div className="pt-1">
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
        </div>
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
        <ModalPortal isOpen={isCreateOpen}>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/20 dark:bg-black/60 backdrop-blur-sm animate-fade-in overflow-y-auto overscroll-none">
            <div className="w-full max-w-md p-4 sm:p-6 rounded-3xl space-y-4 sm:space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto box-border bg-[var(--lg-surface)] border border-[var(--lg-surface-edge)] backdrop-blur-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-[var(--lg-foreground)]">Register Contact</h3>
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
                  placeholder="Full name"
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
                  placeholder="Company"
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
                    placeholder="Phone"
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
                    placeholder="Email"
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

              <div className="flex items-center justify-end gap-2.5 pt-2">
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
          </div>
        </div>
      </ModalPortal>
    )}

      {/* Contact Profile & Latest Payment Detail Modal */}
      <ContactDetailModal
        contact={selectedContact}
        userId={userId}
        onClose={() => setSelectedContact(null)}
      />
    </div>
  );
};
