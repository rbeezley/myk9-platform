import React, { useCallback, useRef, useState } from 'react';
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
import type { PanelDogGroup } from './EntriesPanel.helpers';

interface PendingRemoval {
  dogId: string;
  classId: string;
  label: string;
}

type RemoveLine = (dogId: string, classId: string) => void | Promise<void>;

interface RemoveLineConfirm {
  /** Drop-in for `onRemoveLine`: opens the confirmation instead of removing. */
  requestRemove: RemoveLine;
  /** Render once per panel — the line list is rendered twice (aside + bar). */
  dialog: React.ReactNode;
}

/**
 * Confirm before a fee line leaves the entry (entry-wizard-guidance — "Removing
 * a fee line on the payment step requires confirmation").
 *
 * The removal itself is untouched: `onRemoveLine` is still called with the same
 * `(dogId, classId)` the trash button used to call it with directly, only now
 * after the exhibitor has seen the class named back to them. Cancelling calls
 * nothing at all, so the cart and the totals cannot move.
 */
export function useRemoveLineConfirm(
  groups: PanelDogGroup[],
  onRemoveLine: RemoveLine | undefined
): RemoveLineConfirm {
  const [pending, setPending] = useState<PendingRemoval | null>(null);
  // The dialog is opened programmatically rather than by an AlertDialogTrigger
  // (the trash buttons are rendered by a shared child, twice), so focus return
  // is ours to do: park the invoking control and refocus it on close.
  const invokerRef = useRef<HTMLElement | null>(null);

  const requestRemove = useCallback<RemoveLine>(
    (dogId, classId) => {
      const line = groups
        .find(group => group.dogId === dogId)
        ?.lines.find(candidate => candidate.classId === classId);
      invokerRef.current = document.activeElement as HTMLElement | null;
      setPending({ dogId, classId, label: line?.label ?? 'this class' });
    },
    [groups]
  );

  const close = useCallback(() => {
    setPending(null);
    const invoker = invokerRef.current;
    invokerRef.current = null;
    // The removed line's own button is gone after a confirm; the browser then
    // falls back to the panel, which is where the next control lives anyway.
    if (invoker?.isConnected) invoker.focus();
  }, []);

  const confirm = useCallback(() => {
    if (pending && onRemoveLine) void onRemoveLine(pending.dogId, pending.classId);
    close();
  }, [close, onRemoveLine, pending]);

  const dialog = (
    <AlertDialog open={pending !== null} onOpenChange={open => !open && close()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {pending ? `Remove ${pending.label} from this entry?` : ''}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {pending
              ? `${pending.label} will be taken off this entry and its fee removed from the total. You can add it again from the Select classes step.`
              : ''}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-11">Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={confirm}
            className="min-h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { requestRemove, dialog };
}
