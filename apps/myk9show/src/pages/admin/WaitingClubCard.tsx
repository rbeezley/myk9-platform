import { useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useClubRegistryNumbers } from '@/hooks/queries/useClubRegistryNumbers';
import { formatShortDate } from '@/lib/format/dates';
import { getSafeWebsiteLink } from '@/lib/websiteUrl';
import { formatClubRegistryNumbers } from '@/utils/clubRegistryNumbers';
import type { WaitingClubRow } from './waitingClubRows';

interface WaitingClubCardProps {
  row: WaitingClubRow;
  /** Approve or decline; resolves when the action is done, throws never (the caller reports). */
  onApprove: (row: WaitingClubRow) => Promise<void>;
  onDecline: (row: WaitingClubRow) => Promise<void>;
}

export function WaitingClubCard({ row, onApprove, onDecline }: WaitingClubCardProps) {
  const { request } = row;
  const [busy, setBusy] = useState<'approve' | 'decline' | null>(null);
  const requestNumbers = formatClubRegistryNumbers(request?.clubNumbers);
  // A club made by hand has no request to carry its numbers; read them from the club.
  const { data: clubNumbers } = useClubRegistryNumbers(
    requestNumbers ? undefined : (row.clubId ?? undefined)
  );
  const numbersLabel = requestNumbers || formatClubRegistryNumbers(clubNumbers);
  const websiteLink = getSafeWebsiteLink(request?.requestedClubWebsite);

  const run = async (kind: 'approve' | 'decline') => {
    setBusy(kind);
    try {
      await (kind === 'approve' ? onApprove(row) : onDecline(row));
    } finally {
      setBusy(null);
    }
  };

  return (
    <article className="rounded-md border border-border bg-card p-5" data-testid="waiting-club">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold">{row.name}</h3>
        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900">
          Waiting for approval
        </span>
      </div>
      {numbersLabel ? (
        <p className="mt-1 text-sm text-muted-foreground">Club numbers: {numbersLabel}</p>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">No club number on file</p>
      )}
      <p className="mt-1 text-sm text-muted-foreground">
        {request
          ? `${request.requesterName} · ${request.requesterEmail} · Requested ${formatShortDate(request.createdAt)}`
          : `Created${row.createdAt ? ` ${formatShortDate(row.createdAt)}` : ''} without an access request`}
      </p>
      {websiteLink ? (
        <a
          href={websiteLink.href}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block min-h-11 text-sm text-primary underline-offset-4 hover:underline"
        >
          {websiteLink.label}
        </a>
      ) : request?.requestedClubWebsite ? (
        <p className="mt-2 text-sm text-muted-foreground">{request.requestedClubWebsite}</p>
      ) : null}
      {request?.requestNote && (
        <p className="mt-3 max-w-3xl text-sm leading-relaxed">{request.requestNote}</p>
      )}
      {row.clubId && (
        <Link
          to={`/clubs/${row.clubId}`}
          className="mt-2 inline-flex min-h-11 items-center text-sm text-primary underline-offset-4 hover:underline"
        >
          Open the club
        </Link>
      )}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          className="min-h-11"
          onClick={() => void run('approve')}
          disabled={busy !== null}
          loading={busy === 'approve'}
          aria-label={`Approve ${row.name}`}
        >
          <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />
          Approve
        </Button>
        {request && (
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => void run('decline')}
            disabled={busy !== null}
            loading={busy === 'decline'}
            aria-label={`Decline ${row.name}`}
          >
            <XCircle className="mr-2 h-4 w-4" aria-hidden="true" />
            Decline
          </Button>
        )}
      </div>
    </article>
  );
}
