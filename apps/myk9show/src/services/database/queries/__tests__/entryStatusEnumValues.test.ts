/**
 * Regression tests: entry_status enum values written/read by the query layer
 *
 * The CHECK constraint on entries.entry_status (see migration 139) only allows
 * the 19 canonical values defined in `types/entry-lifecycle.ts`. Before this
 * suite existed, several queries used legacy values ('accepted', 'checked_in',
 * 'pending', 'waitlisted') that silently returned empty sets on reads and
 * failed the CHECK on writes. These tests assert each query passes the correct
 * canonical values to Supabase.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getMoveUpEligibleEntries,
  denyMoveUpRequest,
  getScratchableEntries,
  scratchEntry,
  requestScratch,
  approveScratchRequest,
  denyScratchRequest,
} from '../../day-of-operations';
import { getEntryCountsByStatus } from '../../entries/secretary';
import { autoAssignArmbands, getNextArmbandForShow } from '../../armbands';

const replicationMocks = vi.hoisted(() => ({
  getArmbandsByShow: vi.fn(),
  getEntriesByShow: vi.fn(),
  getClassById: vi.fn(),
  getDogById: vi.fn(),
  upsertAssignedArmband: vi.fn(),
  updateArmbandForDogInShow: vi.fn(),
}));

const mockFrom = vi.fn();

vi.mock('../../supabaseClient', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
  logQuery: vi.fn(),
  createDatabaseError: (err: unknown) => (err instanceof Error ? err : new Error(String(err))),
}));

vi.mock('@/services/replication/ReplicatedArmbandsTable', () => ({
  replicatedArmbandsTable: {
    getByShow: replicationMocks.getArmbandsByShow,
    upsertAssignedArmband: replicationMocks.upsertAssignedArmband,
  },
}));

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: {
    getEntriesByShow: replicationMocks.getEntriesByShow,
    updateArmbandForDogInShow: replicationMocks.updateArmbandForDogInShow,
  },
}));

vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: {
    getClassById: replicationMocks.getClassById,
  },
}));

vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: {
    getDogById: replicationMocks.getDogById,
  },
}));

function chainMock(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    ...overrides,
  };
  for (const [key, val] of Object.entries(chain)) {
    if (typeof val === 'function' && !(key in overrides)) {
      (chain[key] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
    }
  }
  return chain;
}

describe('entry_status enum values used by query layer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    replicationMocks.getArmbandsByShow.mockResolvedValue([]);
    replicationMocks.getEntriesByShow.mockResolvedValue([]);
    replicationMocks.getClassById.mockResolvedValue({
      id: 'class-1',
      name: 'Novice',
      classNumber: '101',
      trialId: 'trial-1',
    });
    replicationMocks.getDogById.mockResolvedValue({
      id: 'dog-1',
      name: 'Rocket Dog',
      callName: 'Rocket',
    });
    replicationMocks.upsertAssignedArmband.mockResolvedValue('armband-mutation');
    replicationMocks.updateArmbandForDogInShow.mockResolvedValue({
      updated: 1,
      mutationIds: ['entry-mutation'],
    });
  });

  describe('moveUpQueries', () => {
    it('getMoveUpEligibleEntries filters replicated rows by canonical statuses', async () => {
      replicationMocks.getEntriesByShow.mockResolvedValue([
        {
          id: 'canonical-confirmed',
          showId: 'show-1',
          classId: 'class-1',
          dogId: 'dog-1',
          entryStatus: 'confirmed',
        },
        {
          id: 'canonical-checked-in',
          showId: 'show-1',
          classId: 'class-1',
          dogId: 'dog-1',
          entry_status: 'checked-in',
        },
        {
          id: 'legacy-accepted',
          showId: 'show-1',
          classId: 'class-1',
          dogId: 'dog-1',
          entryStatus: 'accepted',
        },
        {
          id: 'loose-status',
          showId: 'show-1',
          classId: 'class-1',
          dogId: 'dog-1',
          status: 'confirmed',
        },
      ]);

      const { data } = await getMoveUpEligibleEntries('show-1');

      expect(replicationMocks.getEntriesByShow).toHaveBeenCalledWith('show-1');
      expect(mockFrom).not.toHaveBeenCalledWith('entries');
      expect(data.map(entry => entry.id)).toEqual(['canonical-checked-in', 'canonical-confirmed']);
    });

    it('denyMoveUpRequest reverts status to "confirmed" and matches "move-up-requested"', async () => {
      const chain = chainMock({
        single: vi.fn().mockResolvedValue({ data: { id: 'e1' }, error: null }),
      });
      mockFrom.mockReturnValue(chain);

      await denyMoveUpRequest('entry-1', 'not eligible');

      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({ entry_status: 'confirmed' })
      );
      expect(chain.eq).toHaveBeenCalledWith('entry_status', 'move-up-requested');
    });
  });

  describe('scratchQueries', () => {
    it('getScratchableEntries filters replicated rows by canonical statuses', async () => {
      replicationMocks.getEntriesByShow.mockResolvedValue([
        {
          id: 'canonical-confirmed',
          showId: 'show-1',
          classId: 'class-1',
          dogId: 'dog-1',
          entryStatus: 'confirmed',
          runOrder: 2,
        },
        {
          id: 'canonical-checked-in',
          showId: 'show-1',
          classId: 'class-1',
          dogId: 'dog-1',
          entry_status: 'checked-in',
          runOrder: 1,
        },
        {
          id: 'legacy-accepted',
          showId: 'show-1',
          classId: 'class-1',
          dogId: 'dog-1',
          entryStatus: 'accepted',
          runOrder: 3,
        },
      ]);

      const { data } = await getScratchableEntries('show-1');

      expect(replicationMocks.getEntriesByShow).toHaveBeenCalledWith('show-1');
      expect(mockFrom).not.toHaveBeenCalledWith('entries');
      expect(data.map(entry => entry.id)).toEqual(['canonical-checked-in', 'canonical-confirmed']);
    });

    it('scratchEntry writes entry_status = "scratched" and check_in_status = "pulled"', async () => {
      const chain = chainMock({
        single: vi.fn().mockResolvedValue({ data: { id: 'e1' }, error: null }),
      });
      mockFrom.mockReturnValue(chain);

      await scratchEntry('entry-1', 'withdrew');

      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({ entry_status: 'scratched', check_in_status: 'pulled' })
      );
    });

    it('requestScratch writes entry_status = "scratch-requested"', async () => {
      const chain = chainMock({
        single: vi.fn().mockResolvedValue({ data: { id: 'e1' }, error: null }),
      });
      mockFrom.mockReturnValue(chain);

      await requestScratch('entry-1', 'sick dog');

      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({ entry_status: 'scratch-requested' })
      );
    });

    it('approveScratchRequest matches "scratch-requested" and writes scratched/pulled', async () => {
      const chain = chainMock({
        single: vi.fn().mockResolvedValue({ data: { id: 'e1' }, error: null }),
      });
      mockFrom.mockReturnValue(chain);

      await approveScratchRequest('entry-1');

      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({ entry_status: 'scratched', check_in_status: 'pulled' })
      );
      expect(chain.eq).toHaveBeenCalledWith('entry_status', 'scratch-requested');
    });

    it('denyScratchRequest reverts to "confirmed"', async () => {
      const chain = chainMock({
        single: vi.fn().mockResolvedValue({ data: { id: 'e1' }, error: null }),
      });
      mockFrom.mockReturnValue(chain);

      await denyScratchRequest('entry-1');

      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({ entry_status: 'confirmed' })
      );
    });
  });

  describe('secretaryEntryQueries', () => {
    it('getNextArmbandForShow honors the show starting armband number', async () => {
      const armbandsChain = chainMock({
        not: vi.fn().mockResolvedValue({ data: [], error: null }),
      });
      const showsChain = chainMock({
        maybeSingle: vi
          .fn()
          .mockResolvedValue({ data: { starting_armband_number: 100 }, error: null }),
      });
      mockFrom.mockImplementation(table => (table === 'armbands' ? armbandsChain : showsChain));

      await expect(getNextArmbandForShow('show-1')).resolves.toBe(100);
    });

    it('getNextArmbandForShow starts after the existing max armband', async () => {
      replicationMocks.getArmbandsByShow.mockResolvedValue([
        { id: 'a1', showId: 'show-1', dogId: 'dog-1', armbandNumber: '100' },
        { id: 'a2', showId: 'show-1', dogId: 'dog-2', armbandNumber: '104' },
      ]);
      const showsChain = chainMock({
        maybeSingle: vi
          .fn()
          .mockResolvedValue({ data: { starting_armband_number: 100 }, error: null }),
      });
      mockFrom.mockReturnValue(showsChain);

      await expect(getNextArmbandForShow('show-1')).resolves.toBe(105);
      expect(replicationMocks.getArmbandsByShow).toHaveBeenCalledWith('show-1');
      expect(mockFrom).not.toHaveBeenCalledWith('armbands');
    });

    it('autoAssignArmbands reports the configured start when no entries need assignment', async () => {
      const showsChain = chainMock({
        maybeSingle: vi
          .fn()
          .mockResolvedValue({ data: { starting_armband_number: 100 }, error: null }),
      });
      const entriesChain = chainMock();
      entriesChain.is = vi
        .fn()
        .mockReturnValueOnce(entriesChain)
        .mockResolvedValueOnce({ data: [], error: null });
      mockFrom.mockImplementation(table => (table === 'shows' ? showsChain : entriesChain));

      const { data } = await autoAssignArmbands('show-1');

      expect(data?.startedAt).toBe(100);
    });

    it('autoAssignArmbands selects replicated entries with accepted or confirmed status', async () => {
      replicationMocks.getEntriesByShow.mockResolvedValue([
        { id: 'e1', showId: 'show-1', dogId: 'dog-1', entryStatus: 'accepted', armband: null },
        { id: 'e2', showId: 'show-1', dogId: 'dog-2', entryStatus: 'confirmed', armband: null },
        { id: 'e3', showId: 'show-1', dogId: 'dog-3', entryStatus: 'submitted', armband: null },
      ]);

      await autoAssignArmbands('show-1', 100);

      expect(replicationMocks.upsertAssignedArmband).toHaveBeenCalledTimes(2);
      expect(replicationMocks.upsertAssignedArmband).toHaveBeenNthCalledWith(1, {
        showId: 'show-1',
        dogId: 'dog-1',
        armbandNumber: '100',
      });
      expect(replicationMocks.upsertAssignedArmband).toHaveBeenNthCalledWith(2, {
        showId: 'show-1',
        dogId: 'dog-2',
        armbandNumber: '101',
      });
    });

    it('getEntryCountsByStatus counts submitted/confirmed/pending-payment', async () => {
      const rows = [
        { entry_status: 'submitted', payment_status: 'pending' },
        { entry_status: 'confirmed', payment_status: 'paid' },
        { entry_status: 'confirmed', payment_status: 'paid' },
        { entry_status: 'pending-payment', payment_status: 'pending' },
      ];
      const chain = chainMock({
        is: vi.fn().mockResolvedValue({ data: rows, error: null }),
      });
      mockFrom.mockReturnValue(chain);

      const { data } = await getEntryCountsByStatus('show-1');

      expect(data).toEqual({
        total: 4,
        submitted: 1,
        confirmed: 2,
        pendingPayment: 1,
        paymentDue: 2,
      });
    });
  });
});
