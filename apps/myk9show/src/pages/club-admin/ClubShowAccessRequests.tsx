/**
 * Pending show-access requests — the club-admin side of MYK9-571.
 *
 * Extracted from ClubShowAccessTab.tsx to keep that file under the 500-line
 * ceiling. Lists pending club-scoped secretary requests for this club and
 * lets the club admin Approve (grant_club_secretary, via
 * approve_club_role_request) or Deny (deny_club_role_request) them.
 *
 * Also renders pending MEMBERSHIP requests on the Members tab (MYK9-685),
 * with its own copy; approving one adds the person to the roster only.
 *
 * INTENT: a request is an ask, never a grant. Approve here calls the same
 * grant_club_secretary path — and gets the same permission_audit_log row —
 * as appointing someone directly from this tab's "Appoint Secretary" button.
 */
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/components/common/FormField';
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
import { Inbox, Check, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

/** What the list needs from a request; secretary and membership asks both fit. */
export interface PendingClubRequest {
  id: string;
  requesterName: string;
  requesterEmail: string | null;
  requesterNote: string | null;
  createdAt: string;
}

/** Copy that differs between the Show Access (secretary) and Members (membership) lists. */
export interface PendingClubRequestsCopy {
  heading: string;
  unavailableMessage: string;
  denyDescription: string;
  denyFieldId: string;
}

const SHOW_ACCESS_COPY: PendingClubRequestsCopy = {
  heading: 'Pending requests',
  unavailableMessage: "We couldn't load pending show-access requests.",
  denyDescription:
    'They will not be appointed as a secretary from this request. They can still be appointed directly at any time, and — unless you appoint them — cannot resubmit this exact request again.',
  denyFieldId: 'deny-request-note',
};

interface ClubShowAccessRequestsProps {
  requests: PendingClubRequest[];
  unavailable: boolean;
  onRetry: () => void;
  onApprove: (requestId: string) => void;
  onDeny: (requestId: string, note?: string) => void;
  isSaving: boolean;
  copy?: PendingClubRequestsCopy;
}

export const ClubShowAccessRequests: React.FC<ClubShowAccessRequestsProps> = ({
  requests,
  unavailable,
  onRetry,
  onApprove,
  onDeny,
  isSaving,
  copy = SHOW_ACCESS_COPY,
}) => {
  const [pendingDeny, setPendingDeny] = useState<PendingClubRequest | null>(null);
  const [isDenyOpen, setIsDenyOpen] = useState(false);
  const [denyNote, setDenyNote] = useState('');

  const closeDenyDialog = () => {
    setIsDenyOpen(false);
    setDenyNote('');
    setPendingDeny(null);
  };

  const confirmDeny = () => {
    if (!pendingDeny) return;
    const trimmedNote = denyNote.trim();
    onDeny(pendingDeny.id, trimmedNote || undefined);
    closeDenyDialog();
  };

  if (unavailable) {
    return (
      <p
        role="status"
        className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning"
      >
        {copy.unavailableMessage}{' '}
        <button type="button" onClick={onRetry} className="underline underline-offset-2">
          Try again
        </button>
      </p>
    );
  }

  if (requests.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Inbox className="h-4 w-4 text-muted-foreground" />
        <h4 className="text-sm font-semibold text-foreground">{copy.heading}</h4>
        <Badge className="bg-primary/10 text-primary border-primary/20">{requests.length}</Badge>
      </div>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {requests.map(request => (
          <li
            key={request.id}
            className="flex flex-wrap items-start justify-between gap-3 px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <span className="font-medium text-foreground">{request.requesterName}</span>
              {request.requesterEmail && (
                <span className="block text-sm text-muted-foreground">
                  {request.requesterEmail}
                </span>
              )}
              {request.requesterNote && (
                <p className="mt-1 text-sm text-foreground">
                  &ldquo;{request.requesterNote}&rdquo;
                </p>
              )}
              <span className="mt-1 block text-xs text-muted-foreground">
                Requested {formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="gap-1"
                onClick={() => onApprove(request.id)}
                disabled={isSaving}
              >
                <Check className="h-4 w-4" />
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1 border-border text-warning"
                onClick={() => {
                  setPendingDeny(request);
                  setIsDenyOpen(true);
                }}
                disabled={isSaving}
              >
                <X className="h-4 w-4" />
                Deny
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <AlertDialog open={isDenyOpen} onOpenChange={open => !open && closeDenyDialog()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deny {pendingDeny?.requesterName}&apos;s request?</AlertDialogTitle>
            <AlertDialogDescription>{copy.denyDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <FormField
            label="Reason (shown to the requester; kept in myK9’s records)"
            fieldId={copy.denyFieldId}
          >
            <Textarea
              id={copy.denyFieldId}
              placeholder="Optional — helps them understand what to do differently."
              value={denyNote}
              onChange={e => setDenyNote(e.target.value)}
              rows={2}
            />
          </FormField>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep pending</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeny}>Deny request</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
