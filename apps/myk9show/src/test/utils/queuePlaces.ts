import type { QueuePlace, QueuePlaces } from '@/hooks/queries/useMyEntryQueuePlaces';

/** Server places for tests: entry id and place pairs, each a live claim unless it says otherwise. */
export function queuePlaces(
  pairs: ReadonlyArray<readonly [string, number] | readonly [string, number, QueuePlace['claim']]>
): QueuePlaces {
  return new Map(
    pairs.map(([id, place, claim]) => [id, { place, claim: claim ?? 'live' }] as const)
  );
}
