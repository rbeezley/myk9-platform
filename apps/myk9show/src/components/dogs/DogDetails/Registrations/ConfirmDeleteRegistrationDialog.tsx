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

const ConfirmDeleteRegistrationDialog: React.FC<ConfirmDeleteRegistrationDialogProps> = ({ open, onClose, onDelete, registration }) => {
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
          <>Are you sure you want to delete <b>"{registration.registeredName}"</b> ({registration.organization})?</>
        ) : null}
      </div>
    </StandardDialog>
  );
};

export default ConfirmDeleteRegistrationDialog;
