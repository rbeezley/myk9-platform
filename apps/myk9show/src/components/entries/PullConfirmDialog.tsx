/**
 * Confirmation step for pulling one class entry.
 *
 * Extracted from `EntryEditDialog` (MYK9-535) to keep that file under the
 * 500-line ceiling. Presentational only — the caller owns the withdrawal.
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
import { Loader2 } from 'lucide-react';

interface PullConfirmDialogProps {
  open: boolean;
  className: string | null;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function PullConfirmDialog({
  open,
  className,
  isSaving,
  onOpenChange,
  onConfirm,
}: PullConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Pull from class?</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to withdraw from <strong>{className}</strong>? This action cannot
            be undone and the entry fee will not be refunded.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSaving}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isSaving}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Pulling...
              </>
            ) : (
              'Pull Entry'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
