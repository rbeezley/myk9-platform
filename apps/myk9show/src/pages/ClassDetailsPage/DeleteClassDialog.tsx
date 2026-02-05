/**
 * Delete Class Confirmation Dialog
 */

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
import type { ClassData } from './types';

interface DeleteClassDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentClass: ClassData | null;
  onConfirm: () => void;
}

export function DeleteClassDialog({
  open,
  onOpenChange,
  currentClass,
  onConfirm,
}: DeleteClassDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Class</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this class?
            <span className="block mt-2 font-medium text-foreground">
              {currentClass?.element} {currentClass?.level} {currentClass?.section}
            </span>
            <span className="block text-sm text-muted-foreground">from {currentClass?.trial}</span>
            <span className="block mt-2 text-destructive">
              This action cannot be undone. All entries will also be deleted.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
