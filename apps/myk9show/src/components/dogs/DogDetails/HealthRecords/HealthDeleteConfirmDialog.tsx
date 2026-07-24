import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface HealthDeleteConfirmDialogProps {
  recordTitle: string | null;
  isSubmitting?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

const HealthDeleteConfirmDialog: React.FC<HealthDeleteConfirmDialogProps> = ({
  recordTitle,
  isSubmitting = false,
  onCancel,
  onConfirm,
}) => (
  <AlertDialog open={recordTitle !== null} onOpenChange={open => !open && onCancel()}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete this health record?</AlertDialogTitle>
        <AlertDialogDescription>
          {recordTitle
            ? `“${recordTitle}” will be permanently deleted. This action cannot be undone.`
            : ''}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
        <AlertDialogAction
          onClick={onConfirm}
          disabled={isSubmitting}
          className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
        >
          Delete
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

export default HealthDeleteConfirmDialog;
