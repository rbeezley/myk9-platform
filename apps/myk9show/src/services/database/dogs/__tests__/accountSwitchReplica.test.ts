import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseError } from '@/services/database/databaseError';
import type { ReplicatedDog } from '@/services/replication/ReplicatedDogsTable';

/**
 * MYK9-1126 reproduction: a shared browser where account A synced the dogs
 * replica, signed out (MYK9-202 keeps the replica), and exhibitor B signed in.
 * Before B's first dogs sync the replica still holds A's rows.
 *
 * The replica below is what A's sync left: A's dog and nothing of B's. The
 * server mock answers as `dogs_select` RLS does for exhibitor B (owner,
 * co-owner or handler; B is none of those for dog-A): B's own dog only.
 *
 * Findings, pinned here:
 * - The ownership-filtered reads (getAllDogs own scope, getDogsByOwner,
 *   searchDogs, getDogStatistics) never return A's dog to B: they filter the
 *   replica by B's person id before anything leaves the read.
 * - getDogById reads the server first (MYK9-1126), so B reading dog-A's id
 *   gets the server's answer for B (not found), never the replica's copy of
 *   A's dog. Before the fix it answered from the replica with no filter.
 * - Not a leak but the same root cause: getAllDogs answers B's roster from A's
 *   warm replica, online, so B's own dog is missing (a false empty roster).
 */

const PERSON_A = 'person-a';
const PERSON_B = 'person-b';

const { replicaDogs, serverDogs, mockDogsTable } = vi.hoisted(() => ({
  replicaDogs: [] as ReplicatedDog[],
  serverDogs: [] as Record<string, unknown>[],
  mockDogsTable: {
    getAllDogsWithStatus: vi.fn(),
    getAllDogs: vi.fn(),
    getDogById: vi.fn(),
    getDogsByOwner: vi.fn(),
    searchDogs: vi.fn(),
    // B's own queue holds nothing for dog-a.
    getUnsentMutationIdsForRow: vi.fn(async () => [] as string[]),
  },
}));

vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: mockDogsTable,
}));
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: { getAllOrThrow: vi.fn(async () => []) },
}));
vi.mock('@/services/replication/ReplicatedDogRegistrationsTable', () => ({
  replicatedDogRegistrationsTable: {
    getRegistrationsForDogs: vi.fn(async () => []),
    getUnsentWorkForDogs: vi.fn(async () => []),
  },
}));

/**
 * A PostgREST stand-in that answers as RLS does for exhibitor B: `dogs` returns
 * only `serverDogs` (B's), narrowed by `eq` filters; every other table is empty.
 */
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => {
        const eqs: [string, unknown][] = [];
        const rows = () =>
          table === 'dogs'
            ? serverDogs.filter(row => eqs.every(([column, value]) => row[column] === value))
            : [];
        const chain: Record<string, unknown> = {};
        for (const method of ['in', 'is', 'or', 'order', 'ilike', 'gt', 'limit']) {
          chain[method] = () => chain;
        }
        chain.eq = (column: string, value: unknown) => {
          eqs.push([column, value]);
          return chain;
        };
        chain.single = () => {
          const [first] = rows();
          return Promise.resolve(
            first
              ? { data: first, error: null }
              : { data: null, error: { code: 'PGRST116', message: 'no rows' } }
          );
        };
        chain.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve({ data: rows(), error: null, count: rows().length }).then(
            resolve,
            reject
          );
        return chain;
      },
    }),
  },
  logQuery: vi.fn(),
  createDatabaseError,
}));

import {
  getAllDogs,
  getDogById,
  getDogsByOwner,
  getDogStatistics,
  searchDogs,
} from '@/services/database/dogs';

const DOG_A: ReplicatedDog = {
  id: 'dog-a',
  name: 'Ajax',
  callName: 'Ajax',
  breed: 'Border Collie',
  ownerId: PERSON_A,
  microchipNumber: '985112000000001',
  dateOfBirth: '2020-01-01',
};

const DOG_B_SERVER_ROW = {
  id: 'dog-b',
  name: 'Bree',
  call_name: 'Bree',
  breed: 'Beagle',
  owner_id: PERSON_B,
  co_owner_id: null,
  deleted_at: null,
  registrations: [],
};

function ids(data: unknown): string[] {
  return ((data ?? []) as { id: string }[]).map(row => row.id);
}

describe('dogs replica after an account switch (MYK9-1126)', () => {
  beforeEach(() => {
    replicaDogs.length = 0;
    serverDogs.length = 0;
    // A synced; B has not. The replica is warm, so every read answers from it.
    replicaDogs.push(DOG_A);
    serverDogs.push(DOG_B_SERVER_ROW);

    mockDogsTable.getAllDogsWithStatus.mockReset();
    mockDogsTable.getAllDogsWithStatus.mockImplementation(async () => ({
      rows: [...replicaDogs],
      cold: false,
    }));
    mockDogsTable.getAllDogs.mockReset();
    mockDogsTable.getAllDogs.mockImplementation(async () => [...replicaDogs]);
    mockDogsTable.getDogById.mockReset();
    mockDogsTable.getDogById.mockImplementation(
      async (id: string) => replicaDogs.find(dog => dog.id === id) ?? null
    );
    mockDogsTable.getDogsByOwner.mockReset();
    mockDogsTable.getDogsByOwner.mockImplementation(async (ownerId: string) =>
      replicaDogs.filter(dog => dog.ownerId === ownerId)
    );
    mockDogsTable.searchDogs.mockReset();
    mockDogsTable.searchDogs.mockImplementation(async (term: string) =>
      replicaDogs.filter(dog => dog.name.toLowerCase().includes(term.toLowerCase()))
    );
  });

  describe("ownership-filtered reads never return A's dog to B", () => {
    it('getAllDogs, own-dogs scope', async () => {
      const { data, error } = await getAllDogs(PERSON_B);
      expect(error).toBeNull();
      expect(ids(data)).not.toContain('dog-a');
    });

    it('getDogsByOwner for B', async () => {
      const { data, error } = await getDogsByOwner(PERSON_B);
      expect(error).toBeNull();
      expect(ids(data)).not.toContain('dog-a');
    });

    it('searchDogs for B', async () => {
      const { data, error } = await searchDogs('aj', PERSON_B);
      expect(error).toBeNull();
      expect(ids(data)).not.toContain('dog-a');
    });

    it('getDogStatistics for B', async () => {
      const { data, error } = await getDogStatistics(PERSON_B);
      expect(error).toBeNull();
      expect(data).toEqual({ total: 0 });
    });
  });

  it("getDogById does not hand B the replica's copy of A's dog", async () => {
    const { data, error } = await getDogById('dog-a');
    const row = data as Record<string, unknown> | null;
    expect(row?.id).toBeUndefined();
    expect(row?.microchip_number).toBeUndefined();
    // The server's answer for B: no such dog. An error, never an empty dog.
    expect(error?.code).toBe('PGRST116');
    expect(mockDogsTable.getDogById).not.toHaveBeenCalled();
  });

  // Same root cause, not a leak, still open: B's roster is answered from A's
  // replica, so B's own dog is missing until B's first dogs sync.
  it.fails("getAllDogs shows B's own dog before B's first dogs sync", async () => {
    const { data, error } = await getAllDogs(PERSON_B);
    expect(error).toBeNull();
    expect(ids(data)).toEqual(['dog-b']);
  });
});
