import React from 'react';
import StandardDialog from '@/components/common/StandardDialog';
import { Trash2 } from 'lucide-react';
import type { Registration } from '@/types/dog-types';

interface ConfirmDeleteRegistrationDialogProps {
  open: boolean;
  onClose: () => void;
  onDelete: () => void;
  registration: Registration | null;
}

const ConfirmDeleteRegistrationDialog: React.FC<ConfirmDeleteRegistrationDialogProps> = ({
  open,
  onClose,
  onDelete,
  registration,
}) => {
  // The store carries whatever the caller selected: the mapped domain object in
  // some paths, the raw snake_case PostgREST row in others. Reading only
  // `registeredName` rendered `delete ""` on the row shape — and this is the
  // exhibitor's only delete path now.
  const registeredName =
    registration?.registeredName ??
    (registration as { registered_name?: string } | null)?.registered_name ??
    '';

  return (
    <StandardDialog
      open={open}
      onClose={onClose}
      onSave={onDelete}
      title="Delete Registration"
      description="Are you sure you want to delete this registration? This action cannot be undone."
      saveLabel="Delete"
      cancelLabel="Cancel"
      saveIcon={<Trash2 className="w-4 h-4 mr-2" />}
      saveButtonProps={{ variant: 'destructive' }}
    >
      <div className="text-base text-gray-700">
        {registration ? (
          <>
            Are you sure you want to delete <b>"{registeredName}"</b> ({registration.organization})?
          </>
        ) : null}
      </div>
    </StandardDialog>
  );
};

export default ConfirmDeleteRegistrationDialog;
