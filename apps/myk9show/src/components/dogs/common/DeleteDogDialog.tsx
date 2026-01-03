import React from 'react';
import { DeleteConfirmationDialog } from '@/components/base';
import type { Dog } from '@/types/dog-types';

interface DeleteDogDialogProps {
  open: boolean;
  onClose: () => void;
  onDelete: () => void;
  dog: Dog | null;
  isSubmitting?: boolean;
}

const DeleteDogDialog: React.FC<DeleteDogDialogProps> = ({ open, onClose, onDelete, dog, isSubmitting }) => {
  return (
    <DeleteConfirmationDialog
      open={open}
      onOpenChange={onClose}
      onConfirm={onDelete}
      entityName={dog?.callName || 'this dog'}
      entityType="Dog"
      description="This will mark the dog as deleted and hide it from normal view. An administrator can restore it later if needed."
      isDeleting={isSubmitting}
    />
  );
};

export { DeleteDogDialog };
export default DeleteDogDialog;
