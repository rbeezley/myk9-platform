/**
 * The two confirms for club admin role changes, shared by the Admins tab and the Members row menu
 * (MYK9-2364) so both ask the same question before the same RPC runs.
 */
import React, { useState } from 'react';
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
import type { ClubAdmin } from '@/services/database/club-memberships';

interface ClubAdminDialogsProps {
  clubName: string;
  /** The address awaiting confirmation to be made an admin; null when no add is pending. */
  confirmingEmail: string | null;
  onCancelAdd: () => void;
  onConfirmAdd: () => void;
  pendingRemoval: ClubAdmin | null;
  onCancelRemoval: () => void;
  onConfirmRemoval: () => void;
}

export const ClubAdminDialogs: React.FC<ClubAdminDialogsProps> = ({
  clubName,
  confirmingEmail,
  onCancelAdd,
  onConfirmAdd,
  pendingRemoval,
  onCancelRemoval,
  onConfirmRemoval,
}) => {
  // Rendered from the last non-null value so the confirm dialog's exit animation never reads "undefined".
  const [lastPending, setLastPending] = useState(pendingRemoval);
  if (pendingRemoval && pendingRemoval !== lastPending) setLastPending(pendingRemoval);
  const removalName = lastPending?.personName ?? lastPending?.personEmail ?? 'this person';

  return (
    <>
      <AlertDialog open={!!confirmingEmail} onOpenChange={open => !open && onCancelAdd()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Add {confirmingEmail} as an admin of {clubName}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They will be able to edit the club, manage members and open Payments.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmAdd}>Add admin</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!pendingRemoval} onOpenChange={open => !open && onCancelRemoval()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removalName} as an admin?</AlertDialogTitle>
            <AlertDialogDescription>
              They can no longer edit this club or open its Payments. You can add them again later.
              A club always keeps at least one admin.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep them</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmRemoval}>Remove admin</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
