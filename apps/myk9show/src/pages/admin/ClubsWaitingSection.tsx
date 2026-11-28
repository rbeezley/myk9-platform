import { useCallback } from 'react';
import { Inbox, RefreshCw } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { clubQueryKeys } from '@/hooks/queries/useClubsDatabase';
import { refreshClubAuthorization } from '@/features/clubs/refreshClubAuthorization';
import { notifications } from '@/lib/notifications';
import { reviewClubAccessRequest } from '@/services/database/club-access-requests';
import { setClubAuthorization } from '@/services/database/clubs';
import { logger } from '@/services/LoggingService';
import { useClubStore } from '@/store/clubStore';
import { deleteErrorMessage } from '@/features/delete/deleteErrors';
import { reconcileLocalDeletion } from '@/features/delete/deleteLocalState';
import { invalidateAfterDelete } from '@/features/delete/deleteRecords';
import { deviceHasUnsavedWork, stillSavingError } from '@/features/delete/deleteUnsyncedWork';
import { WaitingClubCard, type WaitingClubChoices } from './WaitingClubCard';
import { clubReviewErrorMessage } from './clubReviewErrors';
import { useWaitingClubs } from './useWaitingClubs';
import type { WaitingClubRow } from './waitingClubRows';

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

export function ClubsWaitingSection() {
  const [searchParams] = useSearchParams();
  const requestedCreator = searchParams.get('creator');
  const creator = requestedCreator && UUID.test(requestedCreator) ? requestedCreator : undefined;
  const queryClient = useQueryClient();
  const ensureClubsReady = useClubStore(s => s.ensureClubsReady);

  const {
    rows,
    isPending,
    isError,
    isFetching: isRefreshing,
    refresh,
  } = useWaitingClubs({
    creator,
  });

  const handleApprove = useCallback(
    async (row: WaitingClubRow, choices: WaitingClubChoices): Promise<boolean> => {
      try {
        let clubId = row.clubId;
        if (row.request) {
          clubId =
            (await reviewClubAccessRequest({
              requestId: row.request.id,
              decision: 'approved',
              // No club argument: every request carries its club (MYK9-2549 retired the
              // no-club paths), and a legacy row is approved the same way.
              reviewNote: choices.reviewNote,
            })) ?? clubId;
        } else if (row.clubId) {
          await setClubAuthorization(row.clubId, true);
        }
        notifications.success('Club approved');
        void queryClient.invalidateQueries({ queryKey: clubQueryKeys.lists() });
        if (clubId) await refreshClubAuthorization({ queryClient, ensureClubsReady, clubId });
        await refresh();
        return true;
      } catch (error) {
        logger.error('Failed to approve club', 'admin', { clubId: row.clubId }, error as Error);
        notifications.error(clubReviewErrorMessage(error, 'approve this club'));
        return false;
      }
    },
    [ensureClubsReady, queryClient, refresh]
  );

  const handleDecline = useCallback(
    async (row: WaitingClubRow, choices: WaitingClubChoices): Promise<boolean> => {
      if (!row.request) return false;
      try {
        if (choices.deleteClub) {
          // The same guard as the ordinary delete: a delete cascades, and work on this device
          // that has not uploaded would be purged. An unreadable queue is never a pass.
          let refusal: unknown;
          try {
            if ((await deviceHasUnsavedWork()).total > 0) refusal = stillSavingError();
          } catch (error) {
            refusal = error;
          }
          if (refusal !== undefined) {
            notifications.error(deleteErrorMessage('club', refusal));
            return false;
          }
        }
        await reviewClubAccessRequest({
          requestId: row.request.id,
          decision: 'denied',
          reviewNote: choices.reviewNote,
          // Sent only when ticked, so a plain decline is the call the server already knew.
          ...(choices.deleteClub ? { deleteClub: true } : {}),
        });
        if (choices.deleteClub && row.clubId) {
          // The server already deleted it: drop it from this device without a second delete.
          await reconcileLocalDeletion('club', { id: row.clubId, name: row.name });
          invalidateAfterDelete(queryClient, 'club');
        }
        notifications.success(
          choices.deleteClub ? 'Club request declined and club deleted' : 'Club request declined'
        );
        void queryClient.invalidateQueries({ queryKey: clubQueryKeys.lists() });
        await refresh();
        return true;
      } catch (error) {
        logger.error(
          'Failed to decline club request',
          'admin',
          { requestId: row.request.id },
          error as Error
        );
        notifications.error(clubReviewErrorMessage(error, 'decline this club'));
        return false;
      }
    },
    [queryClient, refresh]
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
          <p className="text-base font-medium">No clubs are waiting for approval.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            New clubs will appear here after someone sets one up.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(row => (
            <WaitingClubCard
              key={row.key}
              row={row}
              onApprove={handleApprove}
              onDecline={handleDecline}
            />
          ))}
        </div>
      )}
    </section>
  );
}
