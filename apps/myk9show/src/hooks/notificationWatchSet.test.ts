/**
 * The push monitor's watch set: owned dogs UNION favorited armbands (MYK9-79).
 *
 * The load-bearing guarantees under test:
 *   - a dog that is BOTH owned and favorited yields exactly ONE watched entry
 *   - a favorited-but-not-owned dog IS watched
 *   - favorites are show-scoped: the same armband at another show is not watched
 *   - `dogsAhead` comes from the shared run queue, so a push can never state a
 *     different number than the entry-list pill
 */

import { describe, it, expect } from 'vitest';
import { computeDogsAheadInList } from '@myk9/ringside';
import type { Entry as RingsideEntry } from '@myk9/ringside';
import { pendingShowEntriesByRunOrder } from '@/utils/showEntryRunQueue';
import {
  EMPTY_WATCH_SET,
  isWatchedEntry,
  watchSetSize,
  watchedUpcomingEntries,
  type NotificationWatchSet,
} from './notificationWatchSet';
import type { ShowEntry } from '@/store/entry-store-types';

const SHOW_ID = 'show-1';
const CLASS_ID = 'class-1';

function showEntry(overrides: {
  id: string;
  dogId: string;
  armband: string;
  runOrder: number;
  showId?: string;
  checkInStatus?: ShowEntry['checkInStatus'];
  scored?: boolean;
}): ShowEntry {
  return {
    id: overrides.id,
    showId: overrides.showId ?? SHOW_ID,
    classId: CLASS_ID,
    dogId: overrides.dogId,
    status: 'confirmed',
    checkInStatus: overrides.checkInStatus,
    registrationData: {
      submittedAt: '2026-07-01T00:00:00.000Z',
      handler: 'Handler',
      entryFee: 30,
      paymentStatus: 'paid',
      armband: overrides.armband,
      runOrder: overrides.runOrder,
    },
    competitionData: overrides.scored
      ? { recordedBy: 'judge', recordedAt: '2026-07-01T00:00:00.000Z' }
      : undefined,
    statusHistory: [],
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  } as ShowEntry;
}

function watchSet(
  ownedDogIds: string[],
  favorites: Record<string, number[]> = {}
): NotificationWatchSet {
  return {
    ownedDogIds: new Set(ownedDogIds),
    favoriteArmbandsByShow: new Map(
      Object.entries(favorites).map(([showId, armbands]) => [showId, new Set(armbands)])
    ),
  };
}

const entries: ShowEntry[] = [
  showEntry({ id: 'e-1', dogId: 'dog-1', armband: '10', runOrder: 1, checkInStatus: 'in-ring' }),
  showEntry({ id: 'e-2', dogId: 'dog-2', armband: '20', runOrder: 2 }),
  showEntry({ id: 'e-3', dogId: 'dog-3', armband: '30', runOrder: 3 }),
  showEntry({ id: 'e-4', dogId: 'dog-4', armband: '40', runOrder: 4 }),
];

describe('isWatchedEntry', () => {
  it('watches a dog the user owns', () => {
    expect(isWatchedEntry(entries[1], watchSet(['dog-2']))).toBe(true);
  });

  it('watches a favorited armband the user does not own', () => {
    expect(isWatchedEntry(entries[1], watchSet([], { [SHOW_ID]: [20] }))).toBe(true);
  });

  it('does not watch a favorited armband from a different show', () => {
    expect(isWatchedEntry(entries[1], watchSet([], { 'show-other': [20] }))).toBe(false);
  });

  it('watches nothing on an empty watch set', () => {
    expect(entries.some(entry => isWatchedEntry(entry, EMPTY_WATCH_SET))).toBe(false);
    expect(watchSetSize(EMPTY_WATCH_SET)).toBe(0);
  });
});

describe('watchedUpcomingEntries', () => {
  it('yields ONE result for a dog that is both owned and favorited', () => {
    const both = watchSet(['dog-2'], { [SHOW_ID]: [20] });
    const watched = watchedUpcomingEntries(entries, 3, both);

    expect(watched).toHaveLength(1);
    expect(watched[0].entry.id).toBe('e-2');
  });

  it('unions owned and favorited dogs without dropping either', () => {
    const mixed = watchSet(['dog-2'], { [SHOW_ID]: [30] });
    const watched = watchedUpcomingEntries(entries, 3, mixed);

    expect(watched.map(item => item.entry.id)).toEqual(['e-2', 'e-3']);
  });

  it('honours the lead-dogs window', () => {
    const watched = watchedUpcomingEntries(entries, 1, watchSet([], { [SHOW_ID]: [40] }));
    expect(watched).toEqual([]);
  });

  it('counts dogs ahead from the shared run queue, matching the entry-list pill', () => {
    const favorited = watchSet([], { [SHOW_ID]: [30] });
    const watched = watchedUpcomingEntries(entries, 3, favorited);
    expect(watched).toHaveLength(1);

    // Independent surface: the ringside entry-list pill for the same entry.
    const ringsideEntries: RingsideEntry[] = entries.map(entry => ({
      id: entry.id,
      armband: Number(entry.registrationData?.armband),
      callName: entry.dogId,
      breed: '',
      handler: '',
      isScored: Boolean(entry.competitionData),
      inRing: entry.checkInStatus === 'in-ring',
      classId: entry.classId,
      exhibitorOrder: entry.registrationData?.runOrder ?? null,
      ...(entry.checkInStatus ? { checkinStatus: entry.checkInStatus } : {}),
    })) as unknown as RingsideEntry[];

    expect(computeDogsAheadInList(ringsideEntries, 'e-3')).toEqual({
      kind: 'waiting',
      dogsAhead: watched[0].dogsAhead,
    });
  });

  it('excludes the in-ring dog from the queue, so the next dog reports 0 ahead', () => {
    const queue = pendingShowEntriesByRunOrder(entries);
    expect(queue[0].id).toBe('e-2');

    const watched = watchedUpcomingEntries(entries, 3, watchSet(['dog-2']));
    expect(watched[0].dogsAhead).toBe(0);
  });
});
