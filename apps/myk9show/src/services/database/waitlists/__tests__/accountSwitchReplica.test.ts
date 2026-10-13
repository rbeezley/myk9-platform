// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseError } from '@/services/database/databaseError';

/**
 * MYK9-1133 step 1: waitlist reads after an account switch.
 *
 * Account A (secretary of show-y) synced the waitlist, entries, classes and
 * trials replicas, signed out (MYK9-202 keeps them), and account B, whom
 * `waitlist_entries_select` gives no row of show-y, signed in. The server mock
 * answers as RLS does for B: no waitlist row, a head count of 0.
 *
 * getWaitlistByClass, getWaitlistOffersByClass and getClassesWithWaitlistCounts
 * are replica ONLY: no server call exists on the path, online or off. They are
 * fed by the subscription/sync, so there is no "offline fallback by design"
 * excuse for the online case: B reads A's rows from IndexedDB while connected.
 *
 * getWaitlistReportRows compares the local waiting count with a server head
 * count before printing (`verifyAgainstServer`), so for B (server count 0, A's
 * rows local) it refuses with WaitlistNotDownloadedError. That is the safe
 * shape, and is pinned as a normal `it`.
 *
 * Leaks are pinned with `it.fails`. Each has a positive control: the same call
 * as A returns A's exact ids/counts, so a mis-seeded replica cannot pass a
 * leak test for the wrong reason.
 */

const { state } = vi.hoisted(() => ({
  state: {
    user: 'A' as 'A' | 'B' | null,
    offline: false,
    // Who synced the waitlist table and the show-y entries scope (undefined: a pre-change cache).
    waitlistStampedBy: 'user-a' as string | undefined,
    entriesStampedBy: 'user-a' as string | undefined,
  },
}));

const currentUserId = () => (state.user ? (state.user === 'A' ? 'user-a' : 'user-b') : null);

const CLASS_Y = {
  id: 'class-y',
  name: 'Interior 1',
  element: 'Interior',
  level: '1',
  trialId: 'trial-y',
  maxEntries: 10,
};
const WAITING_A1 = {
  id: 'wl-a1',
  classId: 'class-y',
  dogId: 'dog-a',
  position: 1,
  status: 'waiting',
};
const WAITING_A2 = { ...WAITING_A1, id: 'wl-a2', position: 2 };
const OFFERED_A3 = {
  id: 'wl-a3',
  classId: 'class-y',
  dogId: 'dog-a',
  position: 3,
  status: 'offered',
  offeredAt: '2026-10-01T10:00:00.000Z',
};
const WAITLIST = [WAITING_A1, WAITING_A2, OFFERED_A3];
const ENTRY_A = { id: 'entry-a1', classId: 'class-y', showId: 'show-y', entryStatus: 'confirmed' };

vi.mock('@/services/replication/ReplicatedWaitlistEntriesTable', () => ({
  replicatedWaitlistEntriesTable: {
    getByClass: vi.fn(async (classId: string) => WAITLIST.filter(w => w.classId === classId)),
    getAllOrThrow: vi.fn(async () => [...WAITLIST]),
    getSyncMetadata: vi.fn(async () => ({
      tableName: 'waitlist_entries',
      totalRows: 3,
      ...(state.waitlistStampedBy ? { syncedByAuthUserId: state.waitlistStampedBy } : {}),
    })),
    getCurrentAuthUserId: vi.fn(async () => currentUserId()),
  },
}));
vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: {
    getTrialsByShow: vi.fn(async (showId: string) =>
      showId === 'show-y' ? [{ id: 'trial-y', name: 'Trial Y', date: '2026-11-01' }] : []
    ),
    getTrialById: vi.fn(async () => ({ id: 'trial-y', name: 'Trial Y', date: '2026-11-01' })),
  },
}));
vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: {
    getClassById: vi.fn(async (id: string) => (id === CLASS_Y.id ? CLASS_Y : null)),
    getClassesByTrial: vi.fn(async (trialId: string) => (trialId === 'trial-y' ? [CLASS_Y] : [])),
  },
}));
vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: {
    getDogById: vi.fn(async (id: string) =>
      id === 'dog-a' ? { id: 'dog-a', name: 'Ajax', callName: 'Ajax', ownerId: 'person-a' } : null
    ),
  },
}));
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: {
    getAllOrThrow: vi.fn(async () => [ENTRY_A]),
    getEntryById: vi.fn(async () => null),
    getSyncMetadata: vi.fn(async (showId?: string) =>
      showId === 'show-y'
        ? {
            tableName: 'entries',
            totalRows: 1,
            ...(state.entriesStampedBy ? { syncedByAuthUserId: state.entriesStampedBy } : {}),
          }
        : null
    ),
    getCurrentAuthUserId: vi.fn(async () => currentUserId()),
  },
}));
vi.mock('@/services/database/entries/handlerHydration', () => ({
  loadHandlerPeople: vi.fn(async () => new Map()),
}));

/** RLS stand-in: the waiting head count is A's 2 rows for A, 0 for B. */
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => {
        const chain: Record<string, unknown> = {};
        for (const method of ['eq', 'in', 'is', 'or', 'order', 'limit']) {
          chain[method] = () => chain;
        }
        chain.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
          (state.offline
            ? Promise.reject(new TypeError('Failed to fetch'))
            : Promise.resolve({ data: null, error: null, count: state.user === 'A' ? 2 : 0 })
          ).then(resolve, reject);
        return chain;
      },
    }),
    rpc: vi.fn(),
  },
  logQuery: vi.fn(),
  createDatabaseError,
}));

import {
  getClassesWithWaitlistCounts,
  getWaitlistByClass,
  getWaitlistOffersByClass,
} from '@/services/database/waitlists';
import { getWaitlistReportRows } from '@/services/database/waitlists/reportRows';

function ids(result: { data: unknown }): string[] {
  return ((result.data ?? []) as Array<{ id: string }>).map(row => row.id).sort();
}

beforeEach(() => {
  state.user = 'A';
  state.offline = false;
  state.waitlistStampedBy = 'user-a';
  state.entriesStampedBy = 'user-a';
});

describe('waitlist replica after an account switch (MYK9-1133)', () => {
  describe('positive control: account A reads its own stamped waitlist', () => {
    it('getWaitlistByClass returns the queued ids to A, online and offline', async () => {
      for (const offline of [false, true]) {
        state.offline = offline;
        expect(ids(await getWaitlistByClass('class-y'))).toEqual(['wl-a1', 'wl-a2']);
      }
    });

    it('getWaitlistOffersByClass returns the offered id to A, online and offline', async () => {
      for (const offline of [false, true]) {
        state.offline = offline;
        expect(ids(await getWaitlistOffersByClass('class-y'))).toEqual(['wl-a3']);
      }
    });

    it('getClassesWithWaitlistCounts counts A rows for A, online and offline', async () => {
      for (const offline of [false, true]) {
        state.offline = offline;
        const { data } = await getClassesWithWaitlistCounts('show-y');
        expect(data.map(c => [c.id, c.accepted_count, c.waitlist_count, c.offered_count])).toEqual([
          ['class-y', 1, 2, 1],
        ]);
      }
    });

    it('getWaitlistReportRows returns the queued ids to A', async () => {
      const rows = await getWaitlistReportRows(['class-y']);
      expect(rows.map(row => row.id).sort()).toEqual(['wl-a1', 'wl-a2']);
    });
  });

  describe("B is refused show-y waitlist rows by RLS, so A's rows must not reach B", () => {
    // Replica only, no server path: B gets an error, never A's rows or an empty list.
    it.each([
      ['getWaitlistByClass', () => getWaitlistByClass('class-y')],
      ['getWaitlistOffersByClass', () => getWaitlistOffersByClass('class-y')],
      ['getClassesWithWaitlistCounts', () => getClassesWithWaitlistCounts('show-y')],
    ] as Array<[string, () => Promise<{ data: unknown; error: unknown }>]>)(
      '%s: B must not see A rows',
      async (_name, read) => {
        state.user = 'B';
        const result = await read();
        expect(ids(result)).toEqual([]);
        expect(result.error).not.toBeNull();
      }
    );

    it('a pre-change cache (no stamp) is cold, even for A', async () => {
      state.waitlistStampedBy = undefined;
      const result = await getWaitlistByClass('class-y');
      expect(ids(result)).toEqual([]);
      expect(result.error).not.toBeNull();
    });

    it('an unresolved account matches no stamp', async () => {
      state.user = null;
      const result = await getWaitlistByClass('class-y');
      expect(ids(result)).toEqual([]);
      expect(result.error).not.toBeNull();
    });

    // Capacity enables Offer Spot (accepted_count < max_entries). A count built
    // from a withheld entries scope would read 0 on a full class, so the whole
    // read is unavailable instead of succeeding with a smaller number.
    it.each([
      ['another account synced the show entries', 'user-b'],
      ['a pre-stamp build synced the show entries', undefined],
    ] as const)('class counts are unavailable, not zero, when %s', async (_name, stampedBy) => {
      state.entriesStampedBy = stampedBy;
      const result = await getClassesWithWaitlistCounts('show-y');
      expect(result.data).toEqual([]);
      expect(result.error).not.toBeNull();
      expect(result.error?.message).toMatch(/different account/);
    });
  });

  it('getWaitlistReportRows: B is refused, not handed A rows', async () => {
    state.user = 'B';
    await expect(getWaitlistReportRows(['class-y'])).rejects.toMatchObject({
      name: 'WaitlistNotDownloadedError',
    });
  });
});
