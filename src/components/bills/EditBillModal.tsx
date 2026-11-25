import React from 'react';
import { Contact, Obligation, Project } from '@/domain/entities';
import { QuickAddModal } from '@/components/entry/QuickAddModal';

interface EditBillModalProps {
  bill: Obligation | null;
  projects: readonly Project[];
  contacts: readonly Contact[];
  onClose: () => void;
  onUpdated?: () => void;
}

/**
 * Unified Bill editor — delegates directly to QuickAddModal locked to the Bill tab
 * with all bill fields (including Qty / Unit / Unit Price) prefilled.
 */
export const EditBillModal: React.FC<EditBillModalProps> = ({
  bill,
  onClose,
  onUpdated,
}) => {
  return (
    <QuickAddModal
      isOpen={Boolean(bill)}
      initialEntryType="obligation"
      lockEntryType
      editingBill={bill}
      onClose={onClose}
      onSuccess={onUpdated}
    />
  );
};
