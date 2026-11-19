/**
 * Pending club-admin invitations (MYK9-2211), shown under the admins list. Each row can be sent
 * again or cancelled. A pending invite is not an admin: it takes effect only when the invitee
 * creates an account with that address and confirms it.
 */
import React from 'react';
import { Button } from '@/components/ui/button';
import type { ClubAdminInvite } from '@/services/database/club-memberships';

interface ClubAdminInvitesListProps {
  invites: ClubAdminInvite[];
  /** The list could not be loaded: say so instead of looking like there are no pending invites. */
  isError?: boolean;
  onRetry?: () => void;
  resendingId?: string | undefined;
  cancellingId?: string | undefined;
  onResend: (invite: { inviteId: string; email: string }) => void;
  onCancel: (invite: { inviteId: string; email: string }) => void;
}

const dateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

export const ClubAdminInvitesList: React.FC<ClubAdminInvitesListProps> = ({
  invites,
  isError = false,
  onRetry,
  resendingId,
  cancellingId,
  onResend,
  onCancel,
}) => {
  if (isError) {
    return (
      <p role="status" className="text-sm text-warning">
        We couldn&apos;t load the pending invites.{' '}
        <button type="button" onClick={onRetry} className="underline underline-offset-2">
          Try again
        </button>
      </p>
    );
  }
  if (invites.length === 0) return null;

  return (
    <section aria-labelledby="club-admin-invites-heading" className="space-y-2">
      <h3 id="club-admin-invites-heading" className="text-sm font-medium text-foreground">
        Pending invites
      </h3>
      <p className="text-xs text-muted-foreground">
        These people are not admins yet. They become admins when they open the emailed link and
        accept while signed in with the invited address. An expired invite can only be cancelled,
        then sent again as a new invite.
      </p>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {invites.map(invite => {
          const target = { inviteId: invite.inviteId, email: invite.email };
          return (
            <li
              key={invite.inviteId}
              className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{invite.email}</p>
                <p
                  className={
                    invite.isExpired
                      ? 'text-xs font-medium text-destructive'
                      : 'text-xs text-muted-foreground'
                  }
                >
                  {invite.isExpired ? 'Expired' : 'Expires'}{' '}
                  {dateFormat.format(new Date(invite.expiresAt))}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="min-h-11"
                  disabled={invite.isExpired || resendingId === invite.inviteId}
                  onClick={() => onResend(target)}
                  aria-label={`Resend invite to ${invite.email}`}
                >
                  {resendingId === invite.inviteId ? 'Sending...' : 'Resend'}
                </Button>
                <Button
                  variant="outline"
                  className="min-h-11 text-destructive"
                  disabled={cancellingId === invite.inviteId}
                  onClick={() => onCancel(target)}
                  aria-label={`Cancel invite to ${invite.email}`}
                >
                  Cancel invite
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
