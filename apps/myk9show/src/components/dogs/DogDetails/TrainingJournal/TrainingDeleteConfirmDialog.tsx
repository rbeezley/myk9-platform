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

interface TrainingDeleteConfirmDialogProps {
  /** Title of the entry being deleted; null when the dialog is closed. */
  entryTitle: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Entry-identifying delete confirmation for the Training Journal
 * (exhibitor-premium-records "Training actions are accessible and
 * recoverable"). Uses the latch-guarded AlertDialogAction primitive, so a
 * double activation cannot fire the delete twice.
 */
const TrainingDeleteConfirmDialog: React.FC<TrainingDeleteConfirmDialogProps> = ({
  entryTitle,
  onCancel,
  onConfirm,
}) => (
  <AlertDialog open={entryTitle !== null} onOpenChange={open => !open && onCancel()}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete this training session?</AlertDialogTitle>
        <AlertDialogDescription>
          {entryTitle
            ? `"${entryTitle}" will be permanently deleted. This action cannot be undone.`
            : ''}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction
          onClick={onConfirm}
          className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
        >
          Delete
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

export default TrainingDeleteConfirmDialog;
