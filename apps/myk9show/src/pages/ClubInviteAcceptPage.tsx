/**
 * Accept a club-admin invitation (MYK9-2211). The emailed link /club-invite/<token> lands here;
 * the route is account-only, so a signed-out invitee is sent to sign-in (or sign-up) and returned
 * to this page. Opening the link signed in calls accept_club_admin_invite once. Possessing the
 * emailed token is the mailbox proof; the server also requires the signed-in account to be the
 * invited address.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle, Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthContext } from '@/hooks/useAuthContext';
import {
  acceptClubAdminInvite,
  type AcceptClubAdminInviteResult,
} from '@/services/database/club-memberships';
import { logger } from '@/services/LoggingService';

type AcceptState =
  | { status: 'working' }
  | { status: 'done'; result: AcceptClubAdminInviteResult }
  | { status: 'failed' };

export default function ClubInviteAcceptPage() {
  const { token = '' } = useParams<{ token: string }>();
  const { refreshPermissions, signOut } = useAuthContext();
  const [state, setState] = useState<AcceptState>({ status: 'working' });
  const [attempt, setAttempt] = useState(0);
  const startedFor = useRef<string | null>(null);

  useEffect(() => {
    const key = `${token}:${attempt}`;
    if (startedFor.current === key) return;
    startedFor.current = key;

    acceptClubAdminInvite(token)
      .then(async result => {
        if (result.outcome === 'accepted') await refreshPermissions();
        setState({ status: 'done', result });
      })
      .catch(error => {
        logger.error('Failed to accept club admin invite', 'club-admin', {
          error: (error as { message?: unknown } | null)?.message ?? String(error),
        });
        setState({ status: 'failed' });
      });
  }, [token, attempt, refreshPermissions]);

  const outcome = state.status === 'done' ? state.result.outcome : null;
  const clubName = state.status === 'done' ? state.result.clubName : null;
  const succeeded = outcome === 'accepted' || outcome === 'already_accepted';

  let title = 'Checking your invitation';
  let body = 'One moment.';
  if (state.status === 'failed') {
    title = "We couldn't check your invitation";
    body = 'Check your connection and try again.';
  } else if (outcome === 'accepted') {
    title = 'You are now a club admin';
    body = `You can now manage ${clubName ?? 'the club'}: edit it, manage members and open Payments.`;
  } else if (outcome === 'already_accepted') {
    title = 'You are already an admin';
    body = `This invitation was already accepted, so you can manage ${clubName ?? 'the club'}.`;
  } else if (outcome === 'expired') {
    title = 'This invitation has expired';
    body = 'Ask a club admin to send you a new invitation.';
  } else if (outcome === 'wrong_account') {
    title = 'Wrong account';
    body =
      'This invitation was sent to a different email address than the one you are signed in with. Sign out, then open the link again and sign in with the invited address.';
  } else if (outcome === 'invalid') {
    title = "This invitation can't be used";
    body =
      'It may have been cancelled, already used, or replaced by a newer email. Ask a club admin to send it again.';
  }

  return (
    <div className="mx-auto w-full max-w-md p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2" role="status" aria-live="polite">
            {state.status === 'working' ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            ) : succeeded ? (
              <CheckCircle className="h-5 w-5 text-success" aria-hidden="true" />
            ) : (
              <XCircle className="h-5 w-5 text-destructive" aria-hidden="true" />
            )}
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{body}</p>
        </CardContent>
        <CardFooter className="gap-2">
          {succeeded && state.status === 'done' && state.result.clubId && (
            <Button asChild className="min-h-11">
              <Link to={`/clubs/${state.result.clubId}`}>Manage the club</Link>
            </Button>
          )}
          {state.status === 'failed' && (
            <Button
              className="min-h-11"
              onClick={() => {
                setState({ status: 'working' });
                setAttempt(n => n + 1);
              }}
            >
              Try again
            </Button>
          )}
          {outcome === 'wrong_account' && (
            <Button className="min-h-11" onClick={() => void signOut()}>
              Sign out
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
