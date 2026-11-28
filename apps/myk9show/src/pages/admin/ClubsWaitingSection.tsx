import { useCallback, useEffect, useMemo } from 'react';
import { Inbox, RefreshCw } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  clubQueryKeys,
  useClubsAwaitingAuthorizationQuery,
} from '@/hooks/queries/useClubsDatabase';
import { refreshClubAuthorization } from '@/features/clubs/refreshClubAuthorization';
import { STEP_UP_SQLSTATE } from '@/features/step-up/stepUpFetch';
import { notifications } from '@/lib/notifications';
import {
  getPendingClubAccessRequests,
  reviewClubAccessRequest,
} from '@/services/database/club-access-requests';
import { setClubAuthorization } from '@/services/database/clubs';
import { logger } from '@/services/LoggingService';
import { useClubStore } from '@/store/clubStore';
import { LegacyWaitingClubCard, WaitingClubCard, type WaitingClubChoices } from './WaitingClubCard';
import { buildWaitingClubRows, type WaitingClubRow } from './waitingClubRows';

/**
 * MYK9-2527: the one list of clubs waiting for a site admin, and the one Approve.
 *
 * Built from the unauthorized clubs joined with their pending access request, so a club
 * appears once whether its requester asked for it or a site admin made it by hand
 * (MYK9-855, MYK9-2046). Approve is the same act either way: authorize the club and, when
 * a request exists, close it and tell the requester (`review_club_access_request`, or
 * `set_club_authorization`, which runs the same approval when a request is pending). Both
 * need a recent password; the Supabase client's fetch asks for it (MYK9-1208), so nothing
 * here prompts on its own.
 *
 * Online-only: an admin to-do list reads the server, not this device's replica, and
 * refetches on every visit. MYK9-1395: a folded notice links here with `?creator=<auth uid>`
 * and the list narrows to that creator's clubs on the server.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REQUESTS_KEY = ['club-access-requests', 'pending'] as const;

function approvalError(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === STEP_UP_SQLSTATE) return 'Nothing was approved. Confirm your password to continue.';
  return "We couldn't update this club. Try again.";
}

export function ClubsWaitingSection() {
  const [searchParams] = useSearchParams();
  const requestedCreator = searchParams.get('creator');
  const creator = requestedCreator && UUID.test(requestedCreator) ? requestedCreator : undefined;
  const queryClient = useQueryClient();
  const ensureClubsReady = useClubStore(s => s.ensureClubsReady);

  const clubsQuery = useClubsAwaitingAuthorizationQuery(creator);
  const requestsQuery = useQuery({
    queryKey: REQUESTS_KEY,
    queryFn: getPendingClubAccessRequests,
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const { refetch: refetchClubs } = clubsQuery;
  const { refetch: refetchRequests } = requestsQuery;

  // A cached list from an earlier visit is not good enough for a to-do list: another admin may
  // have approved a club, or a new one may have been made, within the cache window.
  useEffect(() => {
    void refetchClubs();
  }, [refetchClubs, creator]);

  const refresh = useCallback(async () => {
    await Promise.all([refetchClubs(), refetchRequests()]);
  }, [refetchClubs, refetchRequests]);

  const rows = useMemo(
    () => buildWaitingClubRows(clubsQuery.data ?? [], requestsQuery.data ?? [], Boolean(creator)),
    [clubsQuery.data, requestsQuery.data, creator]
  );

  const isPending = clubsQuery.isPending || requestsQuery.isPending;
  const isError = clubsQuery.isError || requestsQuery.isError;
  const isRefreshing = clubsQuery.isFetching || requestsQuery.isFetching;

  const handleApprove = useCallback(
    async (row: WaitingClubRow, choices: WaitingClubChoices) => {
      try {
        let clubId = row.clubId;
        if (row.request) {
          clubId =
            (await reviewClubAccessRequest({
              requestId: row.request.id,
              decision: 'approved',
              existingClubId: choices.existingClubId,
              // Only a legacy request with no club yet picks or names one.
              clubName: choices.clubName,
              reviewNote: choices.reviewNote,
            })) ?? clubId;
        } else if (row.clubId) {
          await setClubAuthorization(row.clubId, true);
        }
        notifications.success('Club approved');
        void queryClient.invalidateQueries({ queryKey: clubQueryKeys.lists() });
        if (clubId) await refreshClubAuthorization({ queryClient, ensureClubsReady, clubId });
        await refresh();
      } catch (error) {
        logger.error('Failed to approve club', 'admin', { clubId: row.clubId }, error as Error);
        notifications.error(approvalError(error));
      }
    },
    [ensureClubsReady, queryClient, refresh]
  );

  const handleDecline = useCallback(
    async (row: WaitingClubRow, choices: WaitingClubChoices) => {
      if (!row.request) return;
      try {
        await reviewClubAccessRequest({
          requestId: row.request.id,
          decision: 'denied',
          reviewNote: choices.reviewNote,
        });
        notifications.success('Club request declined');
        await refresh();
      } catch (error) {
        logger.error(
          'Failed to decline club request',
          'admin',
          { requestId: row.request.id },
          error as Error
        );
        notifications.error(approvalError(error));
      }
    },
    [refresh]
  );

  return (
    <section className="mb-8 space-y-4" aria-labelledby="clubs-waiting-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="clubs-waiting-heading" className="text-xl font-semibold">
            Clubs waiting for approval
          </h2>
          <p className="mt-1 max-w-3xl text-base text-muted-foreground">
            A club can build shows but cannot publish until you approve it. Approving gives the club
            its access, closes any request and tells the person who asked.
          </p>
          {creator && (
            <p className="mt-2 text-base text-muted-foreground">
              Showing the clubs from one notification.{' '}
              <Link to="/admin/onboarding" className="font-medium text-primary underline">
                Show all clubs waiting for approval
              </Link>
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 gap-2"
          onClick={() => void refresh()}
          disabled={isRefreshing}
          aria-busy={isRefreshing}
        >
          <RefreshCw
            className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          Refresh
        </Button>
      </div>

      {isError ? (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-4">
          <p className="text-base">
            We couldn&apos;t load the clubs waiting for approval, so we can&apos;t tell which ones
            need it.
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-3 min-h-11"
            onClick={() => void refresh()}
          >
            Try again
          </Button>
        </div>
      ) : isPending ? (
        <p role="status" className="text-base text-muted-foreground">
          Loading clubs…
        </p>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card px-6 py-8 text-center">
          <Inbox className="mx-auto mb-3 h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-base font-medium">
            {creator ? 'These clubs have all been approved.' : 'No clubs are waiting for approval.'}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            New clubs will appear here after someone sets one up.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(row => {
            const Card =
              row.request && row.request.createdClubId === null
                ? LegacyWaitingClubCard
                : WaitingClubCard;
            return (
              <Card key={row.key} row={row} onApprove={handleApprove} onDecline={handleDecline} />
            );
          })}
        </div>
      )}
    </section>
  );
}
