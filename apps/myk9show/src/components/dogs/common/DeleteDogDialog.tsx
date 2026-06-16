import React from 'react';
import { DeleteConfirmationDialog } from '@/components/base';
import type { Dog } from '@/types/dog-types';
import { buildDescription } from './deleteDogDialogCopy';

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
}

const DeleteDogDialog: React.FC<DeleteDogDialogProps> = ({
  open,
  onClose,
  onDelete,
  dog,
  isSubmitting,
  activeEntryCount,
}) => {
  return (
    <DeleteConfirmationDialog
      open={open}
      onOpenChange={onClose}
      onConfirm={onDelete}
      entityName={dog?.callName || 'this dog'}
      entityType="Dog"
      description={buildDescription(activeEntryCount)}
      isDeleting={isSubmitting}
    />
  );
};

export { DeleteDogDialog };
export default DeleteDogDialog;
