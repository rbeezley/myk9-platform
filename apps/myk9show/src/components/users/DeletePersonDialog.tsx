import React from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import type { User } from '@/types/user-types';

// Update DeletePersonDialogProps to match usage in Users-List.tsx
interface DeletePersonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  person: User | null;
  onDelete: () => Promise<void>;
  onCancel: () => void;
}

const DeletePersonDialog: React.FC<DeletePersonDialogProps> = ({ open, onOpenChange, person, onDelete, onCancel }) => {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete {person?.firstName} {person?.lastName} from the directory. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel} className="!rounded-button cursor-pointer whitespace-nowrap">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction onClick={onDelete} className="bg-red-600 hover:bg-red-700 text-white !rounded-button cursor-pointer whitespace-nowrap">
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DeletePersonDialog;
