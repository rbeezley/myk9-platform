import React from 'react';
import StandardDialog from '@/components/common/StandardDialog';

interface DeleteAncestorDialogProps {
  open: boolean;
  ancestorName?: string;
  onClose: () => void;
  onDelete: () => void;
  isSubmitting?: boolean;
}

const DeleteAncestorDialog: React.FC<DeleteAncestorDialogProps> = ({ open, ancestorName, onClose, onDelete, isSubmitting }) => {
  return (
    <StandardDialog
      open={open}
      onClose={onClose}
      onSave={onDelete}
      title={ancestorName ? `Delete ${ancestorName}?` : 'Delete Ancestor?'}
      description={<span className="text-destructive">This action cannot be undone.</span>}
      saveLabel="Delete"
      cancelLabel="Cancel"
      isSubmitting={isSubmitting}
      saveButtonProps={{ variant: 'destructive' }}
    >
      <div className="py-2 text-sm">
        Are you sure you want to delete {ancestorName ? <b>{ancestorName}</b> : 'this ancestor'} from the pedigree? This cannot be undone.
      </div>
    </StandardDialog>
  );
};

export default DeleteAncestorDialog;
