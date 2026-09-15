/**
 * Request Show Access — the exhibitor-side half of MYK9-571.
 *
 * A club that is already on the platform but has not appointed a given
 * exhibitor as secretary previously had no in-app way for that person to
 * ask. Signup already captures elevated-role intent via
 * insert_signup_role_requests, and submit_role_request has existed since May
 * with nothing calling it. This card is the first caller.
 *
 * DESIGN PRINCIPLE (guardrail): a request is an ask; it never grants
 * anything. The club admin's appointment (grant_club_secretary, driven from
 * the Show Access tab) remains the only grant. This card only submits an ask
 * and reflects its own status back — pending ("Under review") or a standing
 * denial (rendered as unavailable, not as a re-askable button).
 *
 * Self-contained by design: it owns its own auth/scope check, its own query
 * for "do I already have a request in flight", and its own submit mutation,
 * so wiring it into MembersTab required no changes to useClubDetailsState or
 * ClubDetails/index.tsx beyond passing the club it already has.
 */
import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/components/common/FormField';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useAuthContext } from '@/hooks/useAuthContext';
import { UserRole } from '@/types/auth-types';
import type { Club } from '@/types/club-types';
import {
  getMyClubSecretaryRequestStatus,
  submitClubSecretaryRequest,
  RoleRequestAlreadyPendingError,
  RoleRequestStandingDenialError,
} from '@/services/database/role-requests';
import { logger } from '@/services/LoggingService';
import { notifications } from '@/lib/notifications';
import { hasClubAdminScope, hasClubSecretaryScope } from './clubPermissions';

interface RequestShowAccessCardProps {
  club: Club;
}

export const RequestShowAccessCard: React.FC<RequestShowAccessCardProps> = ({ club }) => {
  const queryClient = useQueryClient();
  const { userWithRoles } = useAuthContext();
  const [showDialog, setShowDialog] = useState(false);
  const [note, setNote] = useState('');
  const [unavailable, setUnavailable] = useState(false);

  const isSiteAdmin = userWithRoles?.roles?.includes(UserRole.SITE_ADMIN) ?? false;
  const alreadyClubAdmin = hasClubAdminScope(userWithRoles?.scopes, club.id);
  const alreadySecretary = hasClubSecretaryScope(userWithRoles?.scopes, club.id);
  // Someone who can already appoint themselves, or who is already appointed,
  // has nothing to ask for. Site admins can appoint via /admin too, so the
  // card would be a confusing second door for them.
  const eligibleToAsk =
    Boolean(userWithRoles) && !isSiteAdmin && !alreadyClubAdmin && !alreadySecretary;

  const statusQuery = useQuery({
    queryKey: ['my-club-secretary-request', club.id, userWithRoles?.id],
    // MYK9-571 round 2 (P2-1): pass the auth user id we already have instead
    // of a fresh supabase.auth.getUser() round-trip inside the service call
    // — that round-trip discarded its own error and returned null on no
    // user, which read as "no prior request" and re-showed the Request
    // button to someone the query had no real identity for. `enabled` below
    // gates this on the id actually being present.
    queryFn: () => getMyClubSecretaryRequestStatus(club.id, userWithRoles!.id),
    enabled: eligibleToAsk && Boolean(userWithRoles?.id),
  });
  const requestStatus = statusQuery.data?.status ?? null;
  const reviewerNote = statusQuery.data?.reviewerNote ?? null;

  const submitMutation = useMutation({
    mutationFn: (requesterNote: string) =>
      submitClubSecretaryRequest({ clubId: club.id, note: requesterNote }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-club-secretary-request', club.id] });
      setShowDialog(false);
      setNote('');
      notifications.success('Request sent. The club can review it from Members > Show Access.');
    },
    onError: error => {
      if (error instanceof RoleRequestAlreadyPendingError) {
        // The server's own unique index caught a race (two tabs, double
        // click). Not a failure from the requester's point of view.
        queryClient.invalidateQueries({ queryKey: ['my-club-secretary-request', club.id] });
        setShowDialog(false);
        setNote('');
        notifications.info('You already have a request under review for this club.');
        return;
      }
      if (error instanceof RoleRequestStandingDenialError) {
        setShowDialog(false);
        setUnavailable(true);
        notifications.error(error.message);
        return;
      }
      notifications.error("We couldn't send that request. Please try again.");
      logger.error('Failed to submit club secretary request', 'clubs', {
        clubId: club.id,
        error: error instanceof Error ? error.message : String(error),
      });
    },
  });

  if (!eligibleToAsk) return null;

  // An approval can arrive before the auth context's own scopes refresh (a
  // 5-minute poll) catch up, so alreadySecretary above may still be false
  // here. Treat 'approved' the same way: nothing actionable, no re-askable
  // button.
  if (requestStatus === 'approved') return null;

  // A standing denial (guardrail): show nothing actionable, just a quiet
  // note — including the club's own reason, when they gave one. Do not
  // re-expose a button whose submit the server will refuse.
  if (unavailable || requestStatus === 'denied') {
    return (
      <p className="text-sm text-muted-foreground">
        Show access request not available for this club right now.
        {reviewerNote && <span className="block italic">&ldquo;{reviewerNote}&rdquo;</span>}
      </p>
    );
  }

  if (requestStatus === 'pending') {
    return (
      <Badge className="bg-[color:var(--chip-stone-bg)] text-[color:var(--chip-stone-fg)] border-transparent hover:bg-[color:var(--chip-stone-bg)]">
        Show access request under review
      </Badge>
    );
  }

  // A failed status check fails CLOSED: showing the button on an unknown
  // status could re-offer a request the server would refuse (e.g. a standing
  // denial the query just couldn't confirm).
  if (statusQuery.isError) {
    return (
      <p className="text-sm text-muted-foreground">
        We couldn&apos;t check show access request status right now.
      </p>
    );
  }

  // MYK9-571 round 2 (P3-3): render nothing while the status is still
  // loading rather than a disabled button that can vanish the instant data
  // arrives (into "Under review", the denied message, or nothing at all) —
  // a control that appears only to disappear reads as broken, not loading.
  if (statusQuery.isLoading) return null;

  return (
    <>
      <Button variant="outline" className="gap-2 border-border" onClick={() => setShowDialog(true)}>
        <KeyRound className="h-4 w-4" />
        Request show access
      </Button>

      <Dialog open={showDialog} onOpenChange={next => !next && setShowDialog(false)}>
        <DialogContent className="sm:max-w-md">
          <div className="flex items-center gap-3 pb-2">
            <div className="p-2 bg-primary/10 rounded-lg">
              <KeyRound className="h-4 w-4 text-primary" />
            </div>
            <DialogTitle className="text-lg font-semibold text-foreground">
              Request show access
            </DialogTitle>
          </div>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              Ask {club.name} to appoint you as a secretary. This sends a request to the club
              &apos;s admins — it does not grant access on its own. They can approve or deny it from
              Members &gt; Show Access.
            </p>
            <FormField label="Why are you asking?" fieldId="show-access-note" required>
              <Textarea
                id="show-access-note"
                placeholder="e.g. I run entries for this club at in-person shows."
                value={note}
                onChange={e => setNote(e.target.value)}
                rows={3}
              />
            </FormField>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setShowDialog(false)}
                className="border-border"
              >
                Cancel
              </Button>
              <Button
                onClick={() => submitMutation.mutate(note.trim())}
                disabled={!note.trim() || submitMutation.isPending}
              >
                {submitMutation.isPending ? 'Sending...' : 'Send request'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
