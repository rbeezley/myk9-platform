import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useJudgeDayCapacity } from '@/hooks/queries/useJudgeDayCapacity';
import { readShowWaitlist } from '@/services/database/waitlists/waitingRead';
import { WAITLIST_READ_TABLES } from '@/services/database/waitlists/replicaDependencies';
import { findOpenWaitlistSpots } from './waitlistSpots';
import { findRunOutOffers } from './runOutOffers';
import { summarizeWaitlistWaiting, type WaitlistWaiting } from './waitlistWaiting';

/** Under the Waitlist tab's own key, so its one `reload` also refreshes this read. */
const waitingKey = (showId: string) => ['waitlist', showId, 'waiting'] as const;

/**
 * The Waitlist's "waiting for you" for one show (the Show Desk pill and the Actions menu row).
 *
 * Returns `null` while it cannot be said: not yet read, or the replica read failed. A zero is only
 * ever a read answer. The queue and run-out offers are replica reads and work offline; the
 * judge-day figures are the server's (an online-only RPC), so offline or failed the spot half is
 * withheld (`findOpenWaitlistSpots` reports it as `unknown`) and only run-out offers show.
 */
export function useWaitlistWaiting(
  showId: string | null | undefined,
  /** Only a viewer who manages the show reads it: the judge-day RPC is manager-only. */
  manages = true
): WaitlistWaiting | null {
  const queryClient = useQueryClient();
  const enabled = Boolean(showId) && manages;
  const read = useQuery({
    queryKey: waitingKey(showId ?? ''),
    queryFn: () => readShowWaitlist(showId!),
    enabled,
    networkMode: 'always',
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const capacity = useJudgeDayCapacity(showId ?? undefined, enabled);
  const capacityKnown = !capacity.isLoading && !capacity.isPaused && capacity.error === null;
  const judgeDays = capacityKnown ? capacity.judgeDays : null;

  // The replica reporting a change (a new arrival, an offer, a withdrawal) re-reads this.
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
    const spots = findOpenWaitlistSpots({
      classes: classes.map(cls => ({
        id: cls.id,
        name: cls.name,
        trialId: cls.trial_id,
        maxEntries: cls.max_entries,
        seatHoldingCount: cls.accepted_count,
      })),
      waitlist,
      judgeDays,
    });
    return summarizeWaitlistWaiting({
      spots,
      runOut: findRunOutOffers(waitlist),
      classNameById: new Map(classes.map(cls => [cls.id, cls.name])),
    });
  }, [enabled, judgeDays, read.data]);
}
