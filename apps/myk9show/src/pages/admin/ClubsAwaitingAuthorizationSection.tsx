import { useEffect, useMemo } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { formatShortDate } from '@/lib/format/dates';
import { useClubStore } from '@/store/clubStore';

/**
 * MYK9-855: club authorization is a separate site-admin decision (MYK9-572),
 * and approving a request does not do it. This keeps every club that still
 * needs it listed on the existing Onboarding page, so it survives a reload.
 * It only links to `/clubs/:id`, where the one Authorize action lives.
 *
 * `authorizedAt === null` means "explicitly not authorized"; `undefined` means
 * "not synced to this device yet" and is deliberately not listed. The club
 * replica never holds soft-deleted rows, so they cannot appear here.
 */
export function ClubsAwaitingAuthorizationSection() {
  const clubs = useClubStore(s => s.clubs);
  const readiness = useClubStore(s => s.clubReadiness);
  const ensureClubsReady = useClubStore(s => s.ensureClubsReady);

  useEffect(() => {
    void ensureClubsReady();
  }, [ensureClubsReady]);

  const awaiting = useMemo(() => clubs.filter(club => club.authorizedAt === null), [clubs]);
  const loading = readiness === 'loading' && clubs.length === 0;
  // A failed or offline sync must never read as "nothing to authorize". With
  // no clubs on the device there is no answer at all; with cached clubs the
  // answer is only as fresh as the last sync. Both get the same notice and
  // the same touch-sized retry; only the sentence differs.
  const notRefreshed = readiness === 'unavailable' || readiness === 'offline';
  const syncProblem = !notRefreshed ? null : clubs.length === 0 ? 'no-data' : 'stale';
  const retry = () => void ensureClubsReady({ force: true });

  return (
    <section className="mb-8 space-y-3" aria-labelledby="clubs-awaiting-authorization-heading">
      <div>
        <h2 id="clubs-awaiting-authorization-heading" className="text-xl font-semibold">
          Clubs awaiting authorization
        </h2>
        <p className="mt-1 max-w-3xl text-base text-muted-foreground">
          These clubs can build shows, but they cannot publish until you authorize them. Open a club
          to authorize it.
        </p>
      </div>

      {syncProblem && (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-lg border border-dashed border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-base text-muted-foreground">
            {syncProblem === 'no-data'
              ? "Couldn't load clubs, so we can't tell which ones still need authorizing."
              : "Couldn't refresh clubs, so this list is from this device's last sync."}
          </p>
          <Button variant="outline" size="sm" className="min-h-11 shrink-0" onClick={retry}>
            Try again
          </Button>
        </div>
      )}

      {loading ? (
        <p role="status" className="text-base text-muted-foreground">
          Loading clubs…
        </p>
      ) : syncProblem === 'no-data' ? null : awaiting.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-card px-4 py-3 text-base text-muted-foreground">
          {syncProblem === 'stale'
            ? 'No clubs were awaiting authorization at the last sync.'
            : 'All clubs are authorized.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {awaiting.map(club => (
            <li
              key={club.id}
              className="flex flex-col gap-2 rounded-md border border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-base font-medium">{club.name}</p>
                {club.createdAt && (
                  <p className="text-sm text-muted-foreground">
                    Created {formatShortDate(club.createdAt)}
                  </p>
                )}
              </div>
              <Button variant="outline" size="sm" className="min-h-11 shrink-0 gap-2" asChild>
                <Link to={`/clubs/${club.id}`} aria-label={`Open ${club.name} to authorize it`}>
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  Open club
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
