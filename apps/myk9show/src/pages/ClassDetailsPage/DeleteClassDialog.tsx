/**
 * Delete Class Confirmation Dialog
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/** The fields the dialog names; a full `ClassData` fits, and so does a Class Management row. */
export interface DeleteClassDialogClass {
  element?: string | null | undefined;
  level?: string | null | undefined;
  section?: string | null | undefined;
  trial?: string | null | undefined;
}

interface DeleteClassDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentClass: DeleteClassDialogClass | null;
  /**
   * Runs the delete. The dialog stays open while it runs, closes (via `onOpenChange(false)`)
   * only when it resolves, and stays open with the error when it rejects.
   */
  onConfirm: () => void | Promise<void>;
}

export function DeleteClassDialog({
  open,
  onOpenChange,
  currentClass,
  onConfirm,
}: DeleteClassDialogProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (confirmError) {
      setError(
        confirmError instanceof Error && confirmError.message
          ? confirmError.message
          : "We couldn't delete this class. Please try again."
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={next => {
        // A delete in flight cannot be dismissed out from under itself.
        if (pending) return;
        if (!next) setError(null);
        onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Class</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this class?
            <span className="block mt-2 font-medium text-foreground">
              {currentClass?.element} {currentClass?.level} {currentClass?.section}
            </span>
            {currentClass?.trial && (
              <span className="block text-sm text-muted-foreground">from {currentClass.trial}</span>
            )}
            <span className="block mt-2 text-destructive">
              This action cannot be undone. All entries will also be deleted.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button variant="destructive" size="lg" onClick={handleConfirm} disabled={pending}>
            {pending ? 'Deleting...' : 'Delete'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
