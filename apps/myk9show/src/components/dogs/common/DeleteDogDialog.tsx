import React from 'react';
import { DeleteConfirmationDialog } from '@/components/base';
import type { Dog } from '@/types/dog-types';
import { buildImpactSuffix, buildWarningText, deleteDogSubtitle } from './deleteDogDialogCopy';

interface DeleteDogDialogProps {
  open: boolean;
  onClose: () => void;
  onDelete: () => void;
  dog: Dog | null;
  isSubmitting?: boolean;
  /**
   * Live entry count for the dog. When > 0 the dialog warns that deleting the
   * dog will also remove its entries, since soft_delete_dog cascades the delete
   * to entries (see migration 20260616130000). Pass undefined while loading.
   */
  activeEntryCount?: number | undefined;
  /**
   * Whether the current user can restore a deleted dog (admin-only restore UI).
   * Drives the warning copy: admins get the restore note, everyone else gets
   * "This action cannot be undone." Defaults to false (the safe, honest message).
   */
  canRestore?: boolean;
  /**
   * Live entries that make the server refuse the delete (paid or scored). When
   * > 0 the dialog explains the refusal and blocks Delete. Pass undefined while
   * loading — an unknown count must not read as zero and enable a delete the
   * server will reject.
   */
  blockingEntryCount?: number | undefined;
}

const DeleteDogDialog: React.FC<DeleteDogDialogProps> = ({
  open,
  onClose,
  onDelete,
  dog,
  isSubmitting,
  activeEntryCount,
  canRestore = false,
  blockingEntryCount,
}) => {
  const isBlocked = (blockingEntryCount ?? 0) > 0;
  return (
    <DeleteConfirmationDialog
      open={open}
      onOpenChange={onClose}
      onConfirm={onDelete}
      entityName={dog?.callName || 'this dog'}
      entityType="Dog"
      description={deleteDogSubtitle}
      impactSuffix={buildImpactSuffix(activeEntryCount)}
      warningText={buildWarningText(activeEntryCount, canRestore, blockingEntryCount)}
      confirmDisabled={isBlocked}
      isDeleting={isSubmitting}
    />
  );
};

export { DeleteDogDialog };
export default DeleteDogDialog;
