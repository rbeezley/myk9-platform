import { useEffect, useMemo } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { formatShortDate } from '@/lib/format/dates';
import { useClubsQuery } from '@/hooks/queries/useClubsDatabase';

/**
 * MYK9-855: club authorization is a separate site-admin decision (MYK9-572),
 * and approving a request does not do it. This keeps every club that still
 * needs it listed on the existing Onboarding page, so it survives a reload.
 * It only links to `/clubs/:id`, where the one Authorize action lives.
 *
 * Online-only, like the request queue above it: this is an admin to-do list,
 * so it reads the server rather than this device's club replica, whose copy
 * can lag an approval. It refetches on every visit, and an approval
 * invalidates it. `authorizedAt === null` means "explicitly not authorized";
 * `undefined` (field absent) is never listed.
 */
export function ClubsAwaitingAuthorizationSection() {
  const { data: clubs, isPending, isError, refetch } = useClubsQuery();

  // A cached list from an earlier visit is not good enough for a to-do list.
  useEffect(() => {
    void refetch();
  }, [refetch]);

  const awaiting = useMemo(() => (clubs ?? []).filter(club => club.authorizedAt === null), [clubs]);

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

      {isError ? (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-lg border border-dashed border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-base text-muted-foreground">
            Couldn't load clubs, so we can't tell which ones still need authorizing.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="min-h-11 shrink-0"
            onClick={() => void refetch()}
          >
            Try again
          </Button>
        </div>
      ) : isPending ? (
        <p role="status" className="text-base text-muted-foreground">
          Loading clubs…
        </p>
      ) : awaiting.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-card px-4 py-3 text-base text-muted-foreground">
          All clubs are authorized.
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
