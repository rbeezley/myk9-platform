/**
 * The two destructive-confirm dialogs of the club members manager: removing a member or officer,
 * and revoking a secretary's show access. Split out for the 500-line cap (MYK9-1293).
 */

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

export interface ClubRemovalDialogsProps {
  isRemovalOpen: boolean;
  setIsRemovalOpen: (open: boolean) => void;
  pendingRemoval: {
    kind: 'member' | 'officer';
    id: string;
    name: string;
    hasShowAccess: boolean;
  } | null;
  confirmRemoval: () => void;
  isShowAccessRevokeOpen: boolean;
  setIsShowAccessRevokeOpen: (open: boolean) => void;
  pendingShowAccessRevoke: { personId: string; personName: string } | null;
  confirmShowAccessRevoke: () => void;
}

export const ClubRemovalDialogs: React.FC<ClubRemovalDialogsProps> = ({
  isRemovalOpen,
  setIsRemovalOpen,
  pendingRemoval,
  confirmRemoval,
  isShowAccessRevokeOpen,
  setIsShowAccessRevokeOpen,
  pendingShowAccessRevoke,
  confirmShowAccessRevoke,
}) => (
  <>
    {/* AlertDialogContent animates out over 200ms, so it stays mounted after
          pendingRemoval is cleared. Rendering the body from the live value put
          the literal string "undefined" in the title on every confirm AND every
          cancel, and flipped an officer removal to the member wording mid-fade.
          Render from the last non-null value instead. */}
    <AlertDialog open={isRemovalOpen} onOpenChange={open => !open && setIsRemovalOpen(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {pendingRemoval?.kind === 'officer'
              ? `Remove ${pendingRemoval?.name} from this position?`
              : `Remove ${pendingRemoval?.name} from the club?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {pendingRemoval?.kind === 'officer'
              ? 'The officer record is deleted. Their club membership is not affected.'
              : 'Their membership record, join date and dues history are deleted.'}
            {pendingRemoval?.kind === 'member' && pendingRemoval?.hasShowAccess
              ? ' Their show access is separate and is NOT removed — they stay an appointed secretary and can still run this club’s shows. Revoke show access as well if that is what you intend.'
              : ''}{' '}
            This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep them</AlertDialogCancel>
          <AlertDialogAction onClick={confirmRemoval}>
            {pendingRemoval?.kind === 'officer' ? 'Remove officer' : 'Remove member'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog
      open={isShowAccessRevokeOpen}
      onOpenChange={open => !open && setIsShowAccessRevokeOpen(false)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Revoke show access from {pendingShowAccessRevoke?.personName}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {pendingShowAccessRevoke?.personName} will no longer be able to create or run any of
            this club&apos;s shows. This does not remove their club membership.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:flex-wrap sm:space-x-0">
          <AlertDialogCancel className="w-full sm:w-auto">Keep show access</AlertDialogCancel>
          <AlertDialogAction className="w-full sm:w-auto" onClick={confirmShowAccessRevoke}>
            Revoke show access
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
);
