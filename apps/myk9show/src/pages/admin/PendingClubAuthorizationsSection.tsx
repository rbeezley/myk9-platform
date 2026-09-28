import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  getPendingClubAuthorizations,
  PENDING_CLUB_AUTHORIZATIONS_QUERY_KEY,
  setClubAuthorization,
  type PendingClubAuthorization,
} from '@/services/database/clubs';
import { formatShortDate } from '@/lib/format/dates';
import { notifications } from '@/lib/notifications';

export function PendingClubAuthorizationsSection() {
  const queryClient = useQueryClient();
  const {
    data: clubs,
    isPending,
    isFetching,
    isError,
    refetch,
  } = useQuery({
    queryKey: PENDING_CLUB_AUTHORIZATIONS_QUERY_KEY,
    queryFn: getPendingClubAuthorizations,
    retry: false,
  });
  const [selectedClub, setSelectedClub] = useState<PendingClubAuthorization | null>(null);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [authorizationFailed, setAuthorizationFailed] = useState(false);

  const authorize = async () => {
    if (!selectedClub || isAuthorizing) return;
    setIsAuthorizing(true);
    setAuthorizationFailed(false);
    try {
      await setClubAuthorization(selectedClub.id, true);
      notifications.success(`${selectedClub.name} authorized.`);
      setSelectedClub(null);
      await queryClient.invalidateQueries({ queryKey: PENDING_CLUB_AUTHORIZATIONS_QUERY_KEY });
    } catch {
      setAuthorizationFailed(true);
    } finally {
      setIsAuthorizing(false);
    }
  };

  return (
    <section className="mb-8 space-y-4" aria-labelledby="pending-club-authorizations-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="pending-club-authorizations-heading" className="text-xl font-semibold">
            Clubs awaiting authorization
          </h2>
          <p className="mt-1 max-w-3xl text-base text-muted-foreground">
            Club access and publication are separate approvals. These clubs can build shows, but
            cannot publish until a site admin authorizes them.
          </p>
        </div>
        <Button type="button" variant="outline" className="min-h-11" onClick={() => void refetch()}>
          Refresh
        </Button>
      </div>

      {isFetching && <p role="status">Checking club authorization…</p>}
      {isError && !isFetching && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-4">
          <p>We couldn&apos;t check which clubs need authorization.</p>
          <Button
            type="button"
            variant="outline"
            className="mt-3 min-h-11"
            onClick={() => void refetch()}
          >
            Try again
          </Button>
        </div>
      )}
      {!isPending && !isFetching && !isError && clubs?.length === 0 && (
        <p className="rounded-lg border border-dashed border-border bg-card p-5 text-base">
          No clubs are waiting for authorization.
        </p>
      )}
      {!isPending && !isError && clubs && clubs.length > 0 && (
        <div className="space-y-3">
          {clubs.map(club => (
            <article
              key={club.id}
              className="flex flex-col gap-3 rounded-md border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <h3 className="text-base font-semibold">{club.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {[club.city, club.state].filter(Boolean).join(', ') || 'Location not provided'}
                  {club.createdAt ? ` · Created ${formatShortDate(club.createdAt)}` : ''}
                </p>
                {club.website && (
                  <p className="mt-1 text-sm text-muted-foreground break-all">{club.website}</p>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                className="min-h-11 shrink-0"
                onClick={() => {
                  setAuthorizationFailed(false);
                  setSelectedClub(club);
                }}
              >
                <ShieldCheck className="mr-2 h-4 w-4" aria-hidden="true" />
                Authorize {club.name}
              </Button>
            </article>
          ))}
        </div>
      )}

      <AlertDialog
        open={selectedClub !== null}
        onOpenChange={open => {
          if (!open && !isAuthorizing) setSelectedClub(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Authorize {selectedClub?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will list the club publicly and let its organizers publish shows. Confirm that
              this is the club you intend to authorize.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {authorizationFailed && (
            <p role="alert" className="text-sm text-destructive">
              We couldn&apos;t authorize this club. Try again.
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isAuthorizing}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              disabled={isAuthorizing}
              loading={isAuthorizing}
              onClick={() => void authorize()}
            >
              Authorize club
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
