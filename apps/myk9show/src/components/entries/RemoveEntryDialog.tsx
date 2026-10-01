/**
 * Remove Entry confirmation (MYK9-901).
 *
 * The one "this entry was a mistake or a duplicate, take it out" dialog. It
 * soft-deletes the row, so it is reached from every surface that lists a row
 * the secretary can remove: the Entries tab card and the class detail results
 * table. Each caller owns its own write (management action vs. replicated
 * store); only the confirmation is shared.
 *
 * This is NOT Pull or Withdraw. Those keep the entry in the records and live in
 * `RemoveFromClassDialog`.
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

export interface RemoveEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Dog's display name; falls back to "this dog". */
  dogName?: string | undefined;
  /** Class the entry sits in; falls back to "this class". */
  className?: string | undefined;
  handler?: string | undefined;
  armband?: string | undefined;
  /** True when the entry already carries a score, time or placement. */
  hasResults?: boolean | undefined;
  onConfirm: () => void;
}

export function RemoveEntryDialog({
  open,
  onOpenChange,
  dogName,
  className,
  handler,
  armband,
  hasResults = false,
  onConfirm,
}: RemoveEntryDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove entry?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes {dogName || 'this dog'} from {className || 'this class'}. Use this for
            mistaken or duplicate entries; use Pulled or Withdrawn when the entry should stay in
            records.
            {handler !== undefined && (
              <span className="block mt-2 text-sm">Handler: {handler}</span>
            )}
            {armband !== undefined && <span className="block text-sm">Armband: #{armband}</span>}
            {hasResults && (
              <span className="block mt-2 text-destructive font-semibold">
                Warning: This entry has recorded results that will be permanently lost!
              </span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Remove Entry
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
