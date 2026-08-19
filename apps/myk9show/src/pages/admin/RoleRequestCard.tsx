import { CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Club } from '@/types/club-types';
import { formatShortDate } from '@/lib/format/dates';
import type { RoleRequest, RoleRequestStatus } from '@/services/database/role-requests';
import { getRoleRequestStatusPresentation } from './adminStatusPresentation';
import { RoleRequestDetails } from './RoleRequestDetails';
import { getRoleLabel } from './roleRequestPresentation';

export type ActionError = {
  message: string;
  action: 'approve' | 'deny';
};

function StatusBadge({ status }: { status: RoleRequestStatus }) {
  const presentation = getRoleRequestStatusPresentation(status);

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${presentation.className}`}
    >
      {presentation.label}
    </span>
  );
}

interface RoleRequestCardProps {
  request: RoleRequest;
  clubs: Club[];
  selectedClubId: string;
  note: string;
  busyId: string | null;
  busyAction: 'approve' | 'deny' | null;
  actionError: ActionError | undefined;
  detailsOpen: boolean;
  onClubChange: (clubId: string) => void;
  onNoteChange: (note: string) => void;
  onApprove: (request: RoleRequest) => void;
  onDeny: (request: RoleRequest) => void;
  onRetry: (request: RoleRequest, action: ActionError['action']) => void;
  onToggleDetails: () => void;
}

export function RoleRequestCard({
  request,
  clubs,
  selectedClubId,
  note,
  busyId,
  busyAction,
  actionError,
  detailsOpen,
  onClubChange,
  onNoteChange,
  onApprove,
  onDeny,
  onRetry,
  onToggleDetails,
}: RoleRequestCardProps) {
  const isPending = request.status === 'pending';
  const isBusy = busyId === request.id;

  return (
    <article className="rounded-xl border border-border bg-card p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="break-words text-base font-semibold text-foreground">
              {request.requesterName}
            </h3>
            <StatusBadge status={request.status} />
            <span className="text-sm text-muted-foreground">
              {getRoleLabel(request.requestedRole)}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="break-all">{request.requesterEmail ?? 'No email'}</span>
            <span>Requested {formatShortDate(request.createdAt)}</span>
            {request.clubName && <span>{request.clubName}</span>}
          </div>
          {request.requesterNote && (
            <p className="mt-4 rounded-lg border border-border bg-muted/30 px-3 py-3 text-base">
              {request.requesterNote}
            </p>
          )}
        </div>
        {request.status === 'approved' && (
          <div className="inline-flex items-center gap-2 text-sm text-success md:pt-1">
            <CheckCircle2 className="h-4 w-4" />
            Approved {request.reviewedAt ? formatShortDate(request.reviewedAt) : ''}
          </div>
        )}
        {request.status === 'denied' && (
          <div className="inline-flex items-center gap-2 text-sm text-destructive md:pt-1">
            <XCircle className="h-4 w-4" />
            Denied {request.reviewedAt ? formatShortDate(request.reviewedAt) : ''}
          </div>
        )}
        {request.status === 'pending' && (
          <div className="inline-flex items-center gap-2 text-sm text-warning md:pt-1">
            <Clock className="h-4 w-4" />
            Needs review
          </div>
        )}
      </div>

      {isPending && (
        <div
          className="mt-6 grid gap-4 border-t border-border pt-5 md:grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)_auto] md:items-end"
          aria-busy={isBusy}
          aria-live="polite"
        >
          <label className="block text-sm font-medium">
            Club
            <select
              value={selectedClubId}
              aria-describedby={`club-help-${request.id}`}
              aria-required="true"
              onChange={event => onClubChange(event.target.value)}
              className="mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-base focus-visible:border-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <option value="">Choose a club...</option>
              {clubs.map(club => (
                <option key={club.id} value={club.id}>
                  {club.name}
                </option>
              ))}
            </select>
            <span
              id={`club-help-${request.id}`}
              className="mt-1 block text-sm font-normal text-muted-foreground"
            >
              Choose the club that will receive this access.
            </span>
          </label>
          <label className="block text-sm font-medium">
            Admin note
            <input
              type="text"
              value={note}
              onChange={event => onNoteChange(event.target.value)}
              placeholder="Optional note for the access record"
              className="mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-base focus-visible:border-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </label>
          <div className="flex w-full gap-2 md:w-auto">
            <Button
              type="button"
              className="min-h-11 flex-1 md:flex-none"
              onClick={() => onApprove(request)}
              disabled={isBusy || !selectedClubId}
            >
              {busyAction === 'approve' ? (
                <>
                  <Loader2
                    className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                  Approving...
                </>
              ) : (
                'Approve'
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 flex-1 md:flex-none"
              onClick={() => onDeny(request)}
              disabled={isBusy}
            >
              {busyAction === 'deny' ? (
                <>
                  <Loader2
                    className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                  Denying...
                </>
              ) : (
                'Deny'
              )}
            </Button>
          </div>
        </div>
      )}

      {actionError && (
        <div
          className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-3 text-sm text-destructive"
          role="alert"
        >
          <span>{actionError.message}</span>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => onRetry(request, actionError.action)}
            disabled={isBusy}
          >
            Try {actionError.action === 'approve' ? 'approval' : 'denial'} again
          </Button>
        </div>
      )}

      {!isPending && request.reviewerNote && (
        <p className="mt-4 rounded-lg border border-border bg-muted/30 px-3 py-3 text-base text-muted-foreground">
          {request.reviewerNote}
        </p>
      )}

      <RoleRequestDetails request={request} open={detailsOpen} onToggle={onToggleDetails} />
    </article>
  );
}
