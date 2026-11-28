import { useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DeclineClubDialog } from './DeclineClubDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useClubRegistryNumbers } from '@/hooks/queries/useClubRegistryNumbers';
import { formatShortDate } from '@/lib/format/dates';
import { getSafeWebsiteLink } from '@/lib/websiteUrl';
import { formatClubRegistryNumbers } from '@/utils/clubRegistryNumbers';
import type { WaitingClubRow } from './waitingClubRows';

/** What the admin chose on the card beyond the one click. */
export interface WaitingClubChoices {
  /** Optional note stored with the decision; only a request carries one. */
  reviewNote: string | null;
  /** Decline only: also delete the club (MYK9-2528). Never set on an approval. */
  deleteClub: boolean;
}

interface WaitingClubCardProps {
  row: WaitingClubRow;
  /** Approve or decline; resolves when the action is done, throws never (the caller reports). */
  onApprove: (row: WaitingClubRow, choices: WaitingClubChoices) => Promise<void>;
  onDecline: (row: WaitingClubRow, choices: WaitingClubChoices) => Promise<void>;
}

export function WaitingClubCard({ row, onApprove, onDecline }: WaitingClubCardProps) {
  const { request } = row;
  const [busy, setBusy] = useState<'approve' | 'decline' | null>(null);
  const [note, setNote] = useState('');
  const [declining, setDeclining] = useState(false);
  const requestNumbers = formatClubRegistryNumbers(request?.clubNumbers);
  // A club made by hand has no request to carry its numbers; read them from the club.
  const numbersQuery = useClubRegistryNumbers(
    requestNumbers ? undefined : (row.clubId ?? undefined)
  );
  const numbersLabel = requestNumbers || formatClubRegistryNumbers(numbersQuery.data);
  const websiteLink = getSafeWebsiteLink(request?.requestedClubWebsite);

  const run = async (kind: 'approve' | 'decline', deleteClub = false, declineNote?: string) => {
    setBusy(kind);
    const choices: WaitingClubChoices = {
      // A decline carries the dialog's reason; an Approve only the card's own note.
      reviewNote: (declineNote ?? note).trim() || null,
      deleteClub,
    };
    try {
      await (kind === 'approve' ? onApprove(row, choices) : onDecline(row, choices));
    } finally {
      setBusy(null);
      setDeclining(false);
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
      ) : numbersQuery.isError ? (
        <p className="mt-1 text-sm text-muted-foreground">Club numbers could not be loaded</p>
      ) : numbersQuery.isPending && row.clubId ? (
        <p className="mt-1 text-sm text-muted-foreground">Loading club numbers…</p>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">No club number on file</p>
      )}
      <p className="mt-1 text-sm text-muted-foreground">
        {request
          ? `${request.requesterName} · ${request.requesterEmail} · Requested ${formatShortDate(request.createdAt)}`
          : `No access request is pending${row.createdAt ? ` · Created ${formatShortDate(row.createdAt)}` : ''}`}
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
      {request && (
        <label className="mt-3 block text-sm font-medium">
          Review note
          <Input
            value={note}
            onChange={event => setNote(event.target.value)}
            placeholder="Optional note for the requester"
            className="mt-1 min-h-11"
          />
        </label>
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
            onClick={() => setDeclining(true)}
            disabled={busy !== null}
            aria-label={`Decline ${row.name}`}
          >
            <XCircle className="mr-2 h-4 w-4" aria-hidden="true" />
            Decline
          </Button>
        )}
      </div>
      {request && (
        <DeclineClubDialog
          open={declining}
          onOpenChange={setDeclining}
          clubName={row.name}
          clubId={row.clubId}
          initialNote={note}
          busy={busy === 'decline'}
          onConfirm={(deleteClub, reason) => void run('decline', deleteClub, reason)}
        />
      )}
    </article>
  );
}
