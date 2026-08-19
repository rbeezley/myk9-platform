import { ChevronDown } from 'lucide-react';
import { formatShortDate } from '@/lib/format/dates';
import type { RoleRequest } from '@/services/database/role-requests';

const roleLabels: Record<RoleRequest['requestedRole'], string> = {
  club_admin: 'Club admin',
  secretary: 'Show secretary',
};

interface RoleRequestDetailsProps {
  request: RoleRequest;
  open: boolean;
  onToggle: () => void;
}

export function RoleRequestDetails({ request, open, onToggle }: RoleRequestDetailsProps) {
  const detailsId = `role-request-details-${request.id}`;
  const reviewerLabel =
    request.reviewerName ?? (request.reviewedBy ? 'Reviewer profile unavailable' : 'Not reviewed');

  return (
    <div className="mt-4">
      <button
        type="button"
        className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        aria-controls={detailsId}
        aria-expanded={open}
        onClick={onToggle}
      >
        {open ? 'Hide details' : 'View details'}
        <ChevronDown
          className={`h-4 w-4 transition-transform motion-reduce:transition-none ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div id={detailsId} className="mt-3 border-t border-border pt-4">
          <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Requested role</dt>
              <dd className="mt-1 font-medium text-foreground">
                {roleLabels[request.requestedRole]}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Access scope</dt>
              <dd className="mt-1 font-medium text-foreground">
                {request.requestedScope === 'club' ? 'Club-wide access' : 'Show-specific access'}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Club assignment</dt>
              <dd className="mt-1 break-words font-medium text-foreground">
                {request.clubName ?? request.clubId ?? 'Not assigned'}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Show assignment</dt>
              <dd className="mt-1 break-all font-medium text-foreground">
                {request.showId ?? 'No show assignment'}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Reviewed</dt>
              <dd className="mt-1 font-medium text-foreground">
                {request.reviewedAt ? formatShortDate(request.reviewedAt) : 'Not reviewed'}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Reviewed by</dt>
              <dd className="mt-1 break-words font-medium text-foreground">
                {reviewerLabel}
                {request.reviewerEmail && (
                  <span className="block font-normal text-muted-foreground">
                    {request.reviewerEmail}
                  </span>
                )}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Request ID</dt>
              <dd className="mt-1 break-all font-mono text-xs text-muted-foreground">
                {request.id}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
