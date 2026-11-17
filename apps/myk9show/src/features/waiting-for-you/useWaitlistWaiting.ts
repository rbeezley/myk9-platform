import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getClassesWithWaitlistCounts } from '@/services/database/waitlists';
import { replicatedWaitlistEntriesTable } from '@/services/replication/ReplicatedWaitlistEntriesTable';
import { replicatedDogsTable } from '@/services/replication/ReplicatedDogsTable';
import { WAITLIST_READ_TABLES } from '@/services/database/waitlists/replicaDependencies';
import { judgeDayCapacityKey, useJudgeDayCapacity } from '@/hooks/queries/useJudgeDayCapacity';
import { judgeDaysIfCurrent } from '@/hooks/queries/judgeDaysIfCurrent';
import { useIsOnline } from '@/hooks/useNetworkStatus';
import { waitListSettingsQueryOptions } from '@/components/shows/waitListSettingsQuery';
import { findRunOutOffers } from './runOutOffers';
import { toSpotClass } from './spotClass';
import { findOpenWaitlistSpots } from './waitlistSpots';
import { summarizeWaitlistWaiting, type WaitlistWaiting } from './waitlistWaiting';

/** Under the Waitlist tab's own key, so its one `reload` also refreshes this read. */
const waitingKey = (showId: string) => ['waitlist', showId, 'waiting'] as const;

/** The show's classes, and the waitlist rows of those with anyone waiting, an offer, or a run-out. */
async function readWaitlist(showId: string) {
  const { data, error } = await getClassesWithWaitlistCounts(showId);
  if (error) throw error;
  const withRows = data.filter(
    cls =>
      (cls.run_out_count ?? 0) > 0 || (cls.waitlist_count ?? 0) > 0 || (cls.offered_count ?? 0) > 0
  );
  const rows = await Promise.all(
    withRows.map(cls => replicatedWaitlistEntriesTable.getByClass(cls.id))
  );
  return { classes: data, waitlist: rows.flat() };
}

/**
 * The Waitlist's "waiting for you" for one show (the Show Desk pill and the Actions menu row): the
 * offers that ran out, and the classes with a spot to offer and a dog waiting for it.
 *
 * Spots come from `findOpenWaitlistSpots`, the calculation the Waitlist page reads too, and count
 * only when the show's automatic offering is off (with it on, the app offers the spot itself) and
 * the server's judge-day figures are loaded. The waitlist rows are the replica's; the judge-day
 * figures and the setting are online reads, so offline there is no spot to show.
 *
 * Returns `null` while it cannot be said (not yet read, read failed, or the viewer does not manage
 * the show and nothing is read): a zero is only ever a read answer.
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
    queryFn: () => readWaitlist(showId!),
    enabled,
    networkMode: 'always',
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const judgeDayRead = useJudgeDayCapacity(enabled ? showId! : undefined);
  const { data: settings } = useQuery({
    ...waitListSettingsQueryOptions(showId ?? ''),
    enabled,
  });
  // Only an explicit "off" waits for a person; an unread or defaulted setting never shows a spot.
  const spotsWaitForAPerson = settings?.autoOffer === false;

  // The replica reporting a change (an offer, a withdrawal, an expiry) re-reads this and the
  // judge-day figures: a changed waitlist moves them, and the spot is judged against both.
  useEffect(() => {
    if (!showId || !manages) return;
    const onChange = () => {
      void queryClient.invalidateQueries({ queryKey: waitingKey(showId) });
      void queryClient.invalidateQueries({ queryKey: judgeDayCapacityKey(showId) });
    };
    const unsubscribes = WAITLIST_READ_TABLES.map(({ table }) =>
      table.subscribe(onChange, { emitCurrent: false })
    );
    return () => unsubscribes.forEach(unsubscribe => unsubscribe());
  }, [manages, queryClient, showId]);

  // A cached answer is not used while offline, parked or failed (the page asks the same way).
  const judgeDays = judgeDaysIfCurrent(judgeDayRead, useIsOnline());
  const spots = useMemo(
    () =>
      enabled && read.data
        ? findOpenWaitlistSpots({
            classes: read.data.classes.map(toSpotClass),
            waitlist: read.data.waitlist,
            judgeDays,
          })
        : null,
    [enabled, read.data, judgeDays]
  );

  // The next dog's name for the pill, read once a spot is known.
  const nextDogIds = (spotsWaitForAPerson && spots && !spots.unknown ? spots.rows : [])
    .flatMap(row => (row.nextInLine ? [row.nextInLine.dogId] : []))
    .sort();
  const dogNames = useQuery({
    queryKey: [...waitingKey(showId ?? ''), 'dogs', nextDogIds],
    queryFn: async () => {
      const dogs = await Promise.all(nextDogIds.map(id => replicatedDogsTable.getDogById(id)));
      return new Map(
        dogs.flatMap(dog => (dog ? [[dog.id, dog.callName || dog.name || ''] as const] : []))
      );
    },
    enabled: enabled && nextDogIds.length > 0,
    networkMode: 'always',
  });

  return useMemo(() => {
    if (!enabled || !read.data) return null;
    const { classes, waitlist } = read.data;
    return summarizeWaitlistWaiting({
      runOut: findRunOutOffers(waitlist),
      classNameById: new Map(classes.map(cls => [cls.id, cls.name])),
      spots,
      spotsWaitForAPerson,
      dogNameById: dogNames.data,
    });
  }, [enabled, read.data, spots, spotsWaitForAPerson, dogNames.data]);
}
