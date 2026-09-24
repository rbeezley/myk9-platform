import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Inbox, RefreshCw, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useClubsQuery } from '@/hooks/queries/useClubsDatabase';
import { notifications } from '@/lib/notifications';
import { logger } from '@/services/LoggingService';
import { notifyAccessRequestEmail } from '@/services/notifications/accessRequestEmail';
import {
  getPendingClubAccessRequests,
  reviewClubAccessRequest,
  type ClubAccessRequest,
} from '@/services/database/club-access-requests';
import { formatShortDate } from '@/lib/format/dates';

function getSafeWebsiteUrl(value: string | null): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function ReviewCard({
  request,
  clubs,
  onReviewed,
}: {
  request: ClubAccessRequest;
  clubs: { id: string; name: string }[];
  onReviewed: () => Promise<void>;
}) {
  const [clubChoice, setClubChoice] = useState('new');
  const [clubName, setClubName] = useState(request.requestedClubName);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const safeWebsiteUrl = getSafeWebsiteUrl(request.requestedClubWebsite);

  const handleReview = async (decision: 'approved' | 'denied') => {
    try {
      setBusy(true);
      await reviewClubAccessRequest({
        requestId: request.id,
        decision,
        existingClubId: decision === 'approved' && clubChoice !== 'new' ? clubChoice : null,
        clubName: decision === 'approved' ? clubName.trim() : null,
        reviewNote: note.trim() || null,
      });
      notifications.success(
        decision === 'approved' ? 'Club request approved' : 'Club request denied'
      );
      // After the decision is saved; an email problem never undoes it.
      void notifyAccessRequestEmail('new_club', request.id);
      await onReviewed();
    } catch (error) {
      logger.error(
        'Failed to review club access request',
        'admin',
        { requestId: request.id },
        error as Error
      );
      notifications.error("We couldn't update this club request. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="rounded-md border border-border bg-card p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold">{request.requestedClubName}</h3>
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900">
              Waiting for review
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {request.requesterName} · {request.requesterEmail} · Requested{' '}
            {formatShortDate(request.createdAt)}
          </p>
          {safeWebsiteUrl ? (
            <a
              href={safeWebsiteUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block min-h-11 text-sm text-primary underline-offset-4 hover:underline"
            >
              {safeWebsiteUrl}
            </a>
          ) : request.requestedClubWebsite ? (
            <p className="mt-2 text-sm text-muted-foreground">{request.requestedClubWebsite}</p>
          ) : null}
          {request.requestNote && (
            <p className="mt-3 text-sm leading-relaxed">{request.requestNote}</p>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(180px,auto)_minmax(220px,1fr)]">
        <label className="block text-sm font-medium">
          Club to use
          <select
            aria-label={`Club to use for ${request.requestedClubName}`}
            value={clubChoice}
            onChange={event => setClubChoice(event.target.value)}
            className="mt-1 min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base"
          >
            <option value="new">Create a new club</option>
            {clubs.map(club => (
              <option key={club.id} value={club.id}>
                Use {club.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          New club name
          <Input
            value={clubName}
            onChange={event => setClubName(event.target.value)}
            disabled={clubChoice !== 'new'}
            className="mt-1 min-h-11"
          />
        </label>
      </div>
      <label className="mt-3 block text-sm font-medium">
        Review note
        <Input
          value={note}
          onChange={event => setNote(event.target.value)}
          placeholder="Optional note for the requester"
          className="mt-1 min-h-11"
        />
      </label>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          className="min-h-11"
          onClick={() => void handleReview('approved')}
          disabled={busy || (clubChoice === 'new' && !clubName.trim())}
          loading={busy}
        >
          <CheckCircle2 className="mr-2 h-4 w-4" />
          Approve and give club access
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={() => void handleReview('denied')}
          disabled={busy}
        >
          <XCircle className="mr-2 h-4 w-4" />
          Deny request
        </Button>
      </div>
    </article>
  );
}

export function ClubAccessRequestsSection() {
  const [requests, setRequests] = useState<ClubAccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const { data: clubs = [] } = useClubsQuery();

  const loadRequests = useCallback(async () => {
    try {
      setLoading(true);
      setFailed(false);
      setRequests(await getPendingClubAccessRequests());
    } catch (error) {
      setFailed(true);
      logger.error('Failed to load club access requests', 'admin', {}, error as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const pendingRequests = useMemo(
    () => requests.filter(request => request.status === 'pending'),
    [requests]
  );

  return (
    <section className="mb-8 space-y-4" aria-labelledby="new-club-access-requests-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="new-club-access-requests-heading" className="text-xl font-semibold">
            New club access requests
          </h2>
          <p className="mt-1 max-w-3xl text-base text-muted-foreground">
            These requests come from the exhibitor home page when someone is setting up a club for
            the first time. Approval creates or connects the club, adds the requester as an active
            member, and gives them club-admin and secretary/show-manager access for that club.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 gap-2"
          onClick={() => void loadRequests()}
          disabled={loading}
          aria-busy={loading}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          Refresh
        </Button>
      </div>

      {loading && (
        <p role="status" className="text-base text-muted-foreground">
          Loading new club requests…
        </p>
      )}
      {failed && !loading && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-4">
          <p className="text-base">We couldn&apos;t load new club requests.</p>
          <Button
            type="button"
            variant="outline"
            className="mt-3 min-h-11"
            onClick={() => void loadRequests()}
          >
            Try again
          </Button>
        </div>
      )}
      {!loading && !failed && pendingRequests.length === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-card px-6 py-8 text-center">
          <Inbox className="mx-auto mb-3 h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-base font-medium">No new club requests are waiting.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            New requests will appear here after an exhibitor sends one.
          </p>
        </div>
      )}
      {!loading && !failed && pendingRequests.length > 0 && (
        <div className="space-y-3">
          {pendingRequests.map(request => (
            <ReviewCard
              key={request.id}
              request={request}
              clubs={clubs}
              onReviewed={loadRequests}
            />
          ))}
        </div>
      )}
    </section>
  );
}
