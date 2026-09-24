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
 * The eligibility check, status query and submit live in
 * useClubSecretaryRequest (MYK9-685), shared with the Request additional
 * access page, which renders every state inline instead of this compact
 * button-and-dialog form.
 */
import React, { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/components/common/FormField';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import type { Club } from '@/types/club-types';
import { useClubSecretaryRequest } from '@/features/club-requests/useClubSecretaryRequest';

interface RequestShowAccessCardProps {
  club: Club;
}

export const RequestShowAccessCard: React.FC<RequestShowAccessCardProps> = ({ club }) => {
  const [showDialog, setShowDialog] = useState(false);
  const [note, setNote] = useState('');
  const request = useClubSecretaryRequest(club);
  const { state } = request;

  // Nothing actionable to show: signed out, already holds access (site admin,
  // this club's admin, already appointed), approved before scopes refresh, or
  // still loading — a control that appears only to vanish reads as broken.
  if (
    state.kind === 'signed-out' ||
    state.kind === 'has-access' ||
    state.kind === 'approved' ||
    state.kind === 'loading'
  ) {
    return null;
  }

  // A standing denial (guardrail): show nothing actionable, just a quiet
  // note — including the club's own reason, when they gave one. Do not
  // re-expose a button whose submit the server will refuse.
  if (state.kind === 'denied') {
    return (
      <p className="text-sm text-muted-foreground">
        Show access request not available for this club right now.
        {state.reviewerNote && (
          <span className="block italic">&ldquo;{state.reviewerNote}&rdquo;</span>
        )}
      </p>
    );
  }

  if (state.kind === 'blocked') {
    return <p className="text-sm text-muted-foreground">{state.message}</p>;
  }

  if (state.kind === 'pending') {
    return (
      <Badge className="bg-[color:var(--chip-stone-bg)] text-[color:var(--chip-stone-fg)] border-transparent hover:bg-[color:var(--chip-stone-bg)]">
        Show access request under review
      </Badge>
    );
  }

  // A failed status check fails CLOSED: showing the button on an unknown
  // status could re-offer a request the server would refuse.
  if (state.kind === 'error') {
    return (
      <p className="text-sm text-muted-foreground">
        We couldn&apos;t check show access request status right now.
      </p>
    );
  }

  return (
    <>
      <Button variant="outline" className="gap-2 border-border" onClick={() => setShowDialog(true)}>
        <KeyRound className="h-4 w-4" />
        Request show access
      </Button>

      <Dialog
        open={showDialog && !request.justSubmitted}
        onOpenChange={next => !next && setShowDialog(false)}
      >
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
            {request.submitError && (
              <p className="text-sm text-destructive" role="alert">
                {request.submitError}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setShowDialog(false)}
                className="border-border"
              >
                Cancel
              </Button>
              <Button
                onClick={() => request.submit(note.trim())}
                disabled={!note.trim() || request.isSubmitting}
              >
                {request.isSubmitting ? 'Sending...' : 'Send request'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
