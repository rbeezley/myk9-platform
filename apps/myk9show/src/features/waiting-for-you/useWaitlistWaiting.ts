import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getClassesWithWaitlistCounts } from '@/services/database/waitlists';
import { replicatedWaitlistEntriesTable } from '@/services/replication/ReplicatedWaitlistEntriesTable';
import { WAITLIST_READ_TABLES } from '@/services/database/waitlists/replicaDependencies';
import { findRunOutOffers } from './runOutOffers';
import { summarizeWaitlistWaiting, type WaitlistWaiting } from './waitlistWaiting';

/** Under the Waitlist tab's own key, so its one `reload` also refreshes this read. */
const waitingKey = (showId: string) => ['waitlist', showId, 'waiting'] as const;

/** The show's classes, and the waitlist rows of those with an offer that ran out. */
async function readRunOutOffers(showId: string) {
  const { data, error } = await getClassesWithWaitlistCounts(showId);
  if (error) throw error;
  const withRunOut = data.filter(cls => (cls.run_out_count ?? 0) > 0);
  const rows = await Promise.all(
    withRunOut.map(cls => replicatedWaitlistEntriesTable.getByClass(cls.id))
  );
  return { classes: data, waitlist: rows.flat() };
}

/**
 * The Waitlist's "waiting for you" for one show (the Show Desk pill and the Actions menu row): the
 * offers that ran out, which the Waitlist page shows in its run-out notice.
 *
 * Replica only, so it works offline. Returns `null` while it cannot be said (not yet read, read
 * failed, or the viewer does not manage the show and nothing is read): a zero is only ever a read
 * answer. Phase 3 adds the spots to offer, with the Waitlist page showing them.
 */
export function useWaitlistWaiting(
  showId: string | null | undefined,
  /** Only a viewer who manages the show reads it. */
  manages = true
): WaitlistWaiting | null {
  const queryClient = useQueryClient();
  const enabled = Boolean(showId) && manages;
  const read = useQuery({
    queryKey: waitingKey(showId ?? ''),
    queryFn: () => readRunOutOffers(showId!),
    enabled,
    networkMode: 'always',
    staleTime: 0,
    refetchOnMount: 'always',
  });

  // The replica reporting a change (an offer, a withdrawal, an expiry) re-reads this.
  useEffect(() => {
    if (!showId || !manages) return;
    const onChange = () => void queryClient.invalidateQueries({ queryKey: waitingKey(showId) });
    const unsubscribes = WAITLIST_READ_TABLES.map(({ table }) =>
      table.subscribe(onChange, { emitCurrent: false })
    );
    return () => unsubscribes.forEach(unsubscribe => unsubscribe());
  }, [manages, queryClient, showId]);

  return useMemo(() => {
    if (!enabled || !read.data) return null;
    const { classes, waitlist } = read.data;
    return summarizeWaitlistWaiting({
      runOut: findRunOutOffers(waitlist),
      classNameById: new Map(classes.map(cls => [cls.id, cls.name])),
    });
  }, [enabled, read.data]);
}
