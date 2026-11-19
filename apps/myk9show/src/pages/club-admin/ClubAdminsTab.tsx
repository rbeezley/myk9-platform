/**
 * Admins tab of the club members manager (MYK9-2209): who runs this club, add one by email,
 * remove one. Lives with the roster tabs because club admins are not always members, so the roster
 * cannot show them. Admins can open Payments and edit the club; the copy says so.
 */
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { UserMinus } from 'lucide-react';
import { useClubAdmins } from './useClubAdmins';
import { useClubAdminInvites } from './useClubAdminInvites';
import { ClubAdminInvitesList } from './ClubAdminInvitesList';

interface ClubAdminsTabProps {
  clubId: string;
  clubName: string;
}

export const ClubAdminsTab: React.FC<ClubAdminsTabProps> = ({ clubId, clubName }) => {
  const {
    admins,
    isLoading,
    isOffline,
    isError,
    retry,
    addAdmin,
    isAdding,
    pendingRemoval,
    requestRemoval,
    cancelRemoval,
    confirmRemoval,
    isRemoving,
  } = useClubAdmins(clubId);
  const invitesState = useClubAdminInvites(clubId);
  const [email, setEmail] = useState('');

  // An address with no myK9 account cannot be made an admin yet: offer to invite it instead.
  const [inviteOffer, setInviteOffer] = useState<string | null>(null);

  // Adding grants real access (and may email a stranger), so the address is confirmed first.
  const [confirmingEmail, setConfirmingEmail] = useState<string | null>(null);

  const handleAdd = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = email.trim();
    if (trimmed) setConfirmingEmail(trimmed);
  };

  const confirmAdd = async () => {
    const target = confirmingEmail;
    setConfirmingEmail(null);
    if (!target) return;
    try {
      const outcome = await addAdmin(target);
      if (outcome === 'no_account') {
        setInviteOffer(target);
      } else {
        setEmail('');
      }
    } catch {
      // The hook already told the admin; keep the address so they can fix it.
    }
  };

  const confirmInvite = async () => {
    const target = inviteOffer;
    setInviteOffer(null);
    if (!target) return;
    try {
      await invitesState.inviteByEmail(target);
      setEmail('');
    } catch {
      // The hook already told the admin; keep the address so they can fix it.
    }
  };

  // Rendered from the last non-null value so the confirm dialog's exit animation never reads "undefined".
  const [lastPending, setLastPending] = useState(pendingRemoval);
  if (pendingRemoval && pendingRemoval !== lastPending) setLastPending(pendingRemoval);
  const removalName = lastPending?.personName ?? lastPending?.personEmail ?? 'this person';

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Club admins can edit the club, manage members, appoint secretaries and open Payments. Add
        someone by the email on their myK9 account and they become an admin at once. If that address
        has no account yet, you can invite them by email.
      </p>

      <form onSubmit={handleAdd} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1.5">
          <label htmlFor="club-admin-email" className="text-sm font-medium text-foreground">
            Add an admin
          </label>
          <Input
            id="club-admin-email"
            type="email"
            autoComplete="off"
            placeholder="name@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="border-border"
          />
        </div>
        <Button type="submit" disabled={isAdding || invitesState.isInviting || !email.trim()}>
          {isAdding ? 'Adding...' : 'Add admin'}
        </Button>
      </form>

      {isOffline ? (
        <p role="status" className="text-sm text-muted-foreground">
          You are offline. Reconnect to see who has access.
        </p>
      ) : isLoading ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading admins...
        </p>
      ) : isError ? (
        <p role="status" className="text-sm text-warning">
          We couldn&apos;t load the admins list.{' '}
          <button type="button" onClick={retry} className="underline underline-offset-2">
            Try again
          </button>
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {admins.map(admin => (
            <li key={admin.personId} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {admin.personName ?? admin.personEmail ?? 'Unnamed'}
                </p>
                {admin.personName && admin.personEmail && (
                  <p className="truncate text-xs text-muted-foreground">{admin.personEmail}</p>
                )}
              </div>
              <Button
                variant="outline"
                className="min-h-11 text-destructive"
                disabled={isRemoving}
                onClick={() => requestRemoval(admin)}
                aria-label={`Remove admin ${admin.personName ?? admin.personEmail ?? ''}`.trim()}
              >
                <UserMinus className="mr-2 h-4 w-4" />
                Remove admin
              </Button>
            </li>
          ))}
        </ul>
      )}

      <ClubAdminInvitesList
        invites={invitesState.invites}
        isError={invitesState.isError}
        onRetry={invitesState.retry}
        resendingId={invitesState.resendingId}
        cancellingId={invitesState.cancellingId}
        onResend={invitesState.resendInvite}
        onCancel={invitesState.cancelInvite}
      />

      <AlertDialog open={!!inviteOffer} onOpenChange={open => !open && setInviteOffer(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Invite {inviteOffer} to be an admin?</AlertDialogTitle>
            <AlertDialogDescription>
              {inviteOffer} has no myK9 account yet, so nothing was changed. We can email them an
              invitation to {clubName}. They become an admin when they open the emailed link and
              accept while signed in with this address.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not now</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmInvite()}>Send invite</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!confirmingEmail}
        onOpenChange={open => !open && setConfirmingEmail(null)}
      >
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
            <AlertDialogAction onClick={() => void confirmAdd()}>Add admin</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!pendingRemoval} onOpenChange={open => !open && cancelRemoval()}>
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
            <AlertDialogAction onClick={confirmRemoval}>Remove admin</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
