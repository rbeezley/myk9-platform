/**
 * Delete Entry Confirmation Dialog
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
import type { ShowEntry } from './types';

interface Dog {
  id: string;
  name: string;
  callName?: string | undefined;
}

interface DeleteEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entryId: string | null;
  rawEntries: unknown[];
  dogs: Dog[];
  onConfirm: () => void;
}

export function DeleteEntryDialog({
  open,
  onOpenChange,
  entryId,
  rawEntries,
  dogs,
  onConfirm,
}: DeleteEntryDialogProps) {
  const entry = entryId
    ? (rawEntries.find((e) => (e as ShowEntry).id === entryId) as ShowEntry | undefined)
    : undefined;
  const dog = entry ? dogs.find((d) => d.id === entry.dogId) : undefined;
  const hasResults =
    entry?.competitionData?.time ||
    entry?.competitionData?.score ||
    entry?.competitionData?.placement;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Entry</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this entry?
            <span className="block mt-2 font-medium text-foreground">
              {dog?.callName || dog?.name || 'Unknown Dog'}
            </span>
            <span className="block text-sm">
              Handler: {entry?.registrationData?.handler || 'Unknown'}
            </span>
            <span className="block text-sm">
              Armband: #{entry?.registrationData?.armband || 'N/A'}
            </span>
            {hasResults && (
              <span className="block mt-2 text-destructive font-semibold">
                Warning: This entry has recorded results that will be permanently lost!
              </span>
            )}
            <span className="block mt-2 text-destructive">This action cannot be undone.</span>
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
