import { describe, it, expect, afterEach, vi } from 'vitest';
import type { Show } from '@/types/show-types';
import type { SyncableShowEntry } from '@/store/entryStore';
import { getUserEntriesByStatus } from './show-relationships';

const USER = 'user-1';

const show = (id: string, startDate: string, endDate: string): Show =>
  ({ id, startDate, endDate }) as unknown as Show;

// One entry per show, all owned by USER, so status bucketing is what's under test.
const entryFor = (showId: string): SyncableShowEntry =>
  ({ showId, registrationData: { handler: USER } }) as unknown as SyncableShowEntry;

describe('getUserEntriesByStatus', () => {
  afterEach(() => vi.useRealTimers());

  const shows = [
    show('past', '2026-05-10', '2026-05-11'),
    show('today', '2026-05-15', '2026-05-15'),
    show('future', '2026-05-20', '2026-05-21'),
  ];
  const entries = shows.map(s => entryFor(s.id));

  it('buckets a same-day show as active (not past) in the local evening', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 15, 20, 0)); // 2026-05-15 20:00 local

    expect(getUserEntriesByStatus(USER, shows, entries, 'active').map(s => s.id)).toEqual([
      'today',
    ]);
    expect(getUserEntriesByStatus(USER, shows, entries, 'past').map(s => s.id)).toEqual(['past']);
    expect(getUserEntriesByStatus(USER, shows, entries, 'upcoming').map(s => s.id)).toEqual([
      'future',
    ]);
  });
});
