// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseError } from '@/services/database/databaseError';
import type { ReplicatedDog } from '@/services/replication/ReplicatedDogsTable';

/**
 * MYK9-1139: the dog roster reads (getAllDogs, getDogsByOwner, searchDogs,
 * getDogStatistics) read the server first. The replica answers only when the
 * server cannot be reached; this account's unsent dog work is laid over the
 * server's answer; a server that answered with an error is an error.
 */

const { server, mockDogsTable } = vi.hoisted(() => ({
  server: {
    /** What the `dogs` list query resolves to. */
    dogs: { data: [], error: null, count: null } as {
      data: unknown;
      error: unknown;
      count?: number | null;
    },
    /** The `dog_registrations` read: rows, or an error that fails it. */
    registrations: { data: [], error: null } as { data: unknown; error: unknown },
    /** Every keyset page the dogs list read asked for. */
    pages: [] as { after: string | undefined; limit: number }[],
    /** Runs as a page is requested (1-based), before it is answered. */
    beforePage: undefined as ((pageNumber: number) => void) | undefined,
  },
  mockDogsTable: {
    getAllDogsWithStatus: vi.fn(),
    getAllDogs: vi.fn(),
    getDogsByOwner: vi.fn(),
    searchDogs: vi.fn(),
    getUnsentMutationIdsForRow: vi.fn(),
  },
}));

vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: mockDogsTable,
}));
vi.mock('@/services/replication/ReplicatedDogRegistrationsTable', () => ({
  replicatedDogRegistrationsTable: {
    getRegistrationsForDogs: vi.fn(async () => []),
    getUnsentWorkForDogs: vi.fn(async () => []),
  },
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => {
        let after: string | undefined;
        let limit: number | undefined;
        const chain: Record<string, unknown> = {};
        for (const method of ['eq', 'or', 'is', 'order', 'ilike']) chain[method] = () => chain;
        chain.gt = (_column: string, value: string) => {
          after = value;
          return chain;
        };
        chain.limit = (value: number) => {
          limit = value;
          return chain;
        };
        // Offset window, id order: lets a mutation check run the old offset paging.
        chain.range = (from: number, to: number) => {
          server.pages.push({ after: undefined, limit: to - from + 1 });
          server.beforePage?.(server.pages.length);
          const { data, error } = server.dogs;
          const sorted = Array.isArray(data)
            ? [...data].sort((a, b) => String(a.id).localeCompare(String(b.id)))
            : data;
          return Promise.resolve({
            data: Array.isArray(sorted) ? sorted.slice(from, to + 1) : sorted,
            error,
          });
        };
        chain.in = () =>
          // Registrations (or owners).
          Promise.resolve(
            table === 'dog_registrations' ? server.registrations : { data: [], error: null }
          );
        chain.then = (
          resolve: (value: unknown) => unknown,
          reject: (reason: unknown) => unknown
        ) => {
          if (table !== 'dogs')
            return Promise.resolve({ data: [], error: null }).then(resolve, reject);
          if (limit === undefined) return Promise.resolve(server.dogs).then(resolve, reject);
          // A keyset page: ids strictly after the cursor, in id order.
          server.pages.push({ after, limit });
          server.beforePage?.(server.pages.length);
          const { data, error } = server.dogs;
          const page = Array.isArray(data)
            ? [...data]
                .sort((a, b) => String(a.id).localeCompare(String(b.id)))
                .filter(row => after === undefined || String(row.id) > after)
                .slice(0, limit)
            : data;
          return Promise.resolve({ data: page, error }).then(resolve, reject);
        };
        return chain;
      },
    }),
  },
  logQuery: vi.fn(),
  createDatabaseError,
}));

import { getAllDogs, getDogsByOwner, getDogStatistics, searchDogs } from '@/services/database/dogs';

const PERSON = 'person-b';

const serverRow = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  call_name: name,
  breed: 'Beagle',
  owner_id: PERSON,
  co_owner_id: null,
  deleted_at: null,
  registrations: [],
  ...extra,
});

const deviceDog = (
  id: string,
  name: string,
  extra: Partial<ReplicatedDog> = {}
): ReplicatedDog => ({
  id,
  name,
  callName: name,
  breed: 'Beagle',
  ownerId: PERSON,
  ...extra,
});

/** Account A's dog, left in the replica by A's sync. */
const FOREIGN_DOG = deviceDog('dog-a', 'Ajax', { ownerId: 'person-a' });

const ids = (data: unknown) => ((data ?? []) as { id: string }[]).map(row => row.id);

type Read = {
  name: string;
  run: () => Promise<{ data: unknown; error: { code?: string; message: string } | null }>;
  empty: unknown;
};

const reads: Read[] = [
  { name: 'getAllDogs', run: () => getAllDogs(PERSON), empty: [] },
  { name: 'getAllDogs (showAll)', run: () => getAllDogs(PERSON, true), empty: [] },
  { name: 'getDogsByOwner', run: () => getDogsByOwner(PERSON), empty: [] },
  { name: 'searchDogs', run: () => searchDogs('a', PERSON), empty: [] },
  { name: 'getDogStatistics', run: () => getDogStatistics(PERSON), empty: null },
];

describe('dog roster reads, server first (MYK9-1139)', () => {
  let onLine: { mockRestore: () => void } | undefined;

  beforeEach(() => {
    server.dogs = { data: [], error: null, count: null };
    server.registrations = { data: [], error: null };
    server.pages = [];
    server.beforePage = undefined;
    for (const fn of Object.values(mockDogsTable)) fn.mockReset();
    // A warm replica holding only account A's dog.
    mockDogsTable.getAllDogsWithStatus.mockResolvedValue({ rows: [FOREIGN_DOG], cold: false });
    mockDogsTable.getAllDogs.mockResolvedValue([FOREIGN_DOG]);
    mockDogsTable.getDogsByOwner.mockResolvedValue([]);
    mockDogsTable.searchDogs.mockResolvedValue([FOREIGN_DOG]);
  });

  afterEach(() => {
    onLine?.mockRestore();
    onLine = undefined;
  });

  describe('online', () => {
    it("the server's rows win over a warm replica that holds only another account's dogs", async () => {
      server.dogs = { data: [serverRow('dog-b', 'Bree')], error: null };

      for (const read of reads.filter(r => r.name !== 'getDogStatistics')) {
        const { data, error } = await read.run();
        expect(error, read.name).toBeNull();
        expect(ids(data), read.name).toEqual(['dog-b']);
      }
      expect(mockDogsTable.getAllDogsWithStatus).not.toHaveBeenCalled();
      expect(mockDogsTable.getDogsByOwner).not.toHaveBeenCalled();
      expect(mockDogsTable.searchDogs).not.toHaveBeenCalled();
    });

    it("getDogStatistics counts the server's dogs, not the replica's", async () => {
      server.dogs = { data: null, error: null, count: 3 };
      const { data, error } = await getDogStatistics(PERSON);
      expect(error).toBeNull();
      expect(data).toEqual({ total: 3 });
      expect(mockDogsTable.getAllDogs).not.toHaveBeenCalled();
    });

    it('an account with no dogs on the server gets an empty roster, not the replica', async () => {
      server.dogs = { data: [], error: null };
      const { data, error } = await getAllDogs(PERSON);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });
  });

  describe('server unreachable', () => {
    beforeEach(() => {
      server.dogs = { data: null, error: { message: 'Failed to fetch' } };
      mockDogsTable.getAllDogs.mockResolvedValue([deviceDog('dog-b', 'Bree'), FOREIGN_DOG]);
      mockDogsTable.getAllDogsWithStatus.mockResolvedValue({
        rows: [deviceDog('dog-b', 'Bree'), FOREIGN_DOG],
        cold: false,
      });
      mockDogsTable.getDogsByOwner.mockResolvedValue([deviceDog('dog-b', 'Bree')]);
      mockDogsTable.searchDogs.mockResolvedValue([deviceDog('dog-b', 'Bree'), FOREIGN_DOG]);
    });

    it('the replica answers, filtered to the account, as before', async () => {
      for (const read of reads.filter(r => r.name !== 'getAllDogs (showAll)')) {
        const { data, error } = await read.run();
        expect(error, read.name).toBeNull();
        if (read.name === 'getDogStatistics') expect(data).toEqual({ total: 1 });
        else expect(ids(data), read.name).toEqual(['dog-b']);
      }
    });

    it('is also what answers when the browser reports offline', async () => {
      onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      server.dogs = { data: null, error: { message: 'anything' } };
      expect(ids((await getAllDogs(PERSON)).data)).toEqual(['dog-b']);
    });

    it('a cold replica surfaces an error, never an empty roster', async () => {
      mockDogsTable.getAllDogsWithStatus.mockResolvedValue({ rows: [], cold: true });

      const { data, error } = await getAllDogs(PERSON);

      expect(error).not.toBeNull();
      expect(data).toEqual([]);
    });

    it('an unreadable replica surfaces an error too', async () => {
      mockDogsTable.getDogsByOwner.mockRejectedValue(new Error('replica unreadable'));

      const { data, error } = await getDogsByOwner(PERSON);

      expect(error).not.toBeNull();
      expect(data).toEqual([]);
    });
  });

  describe('server answered with an error', () => {
    it('is an error, never an empty roster, and the replica does not answer', async () => {
      server.dogs = { data: null, error: { code: '42501', message: 'permission denied' } };
      mockDogsTable.getAllDogsWithStatus.mockResolvedValue({
        rows: [deviceDog('dog-b', 'Bree')],
        cold: false,
      });

      for (const read of reads) {
        const { data, error } = await read.run();
        expect(error, read.name).not.toBeNull();
        expect(data, read.name).toEqual(read.empty);
      }
      expect(mockDogsTable.getAllDogsWithStatus).not.toHaveBeenCalled();
      expect(mockDogsTable.getDogsByOwner).not.toHaveBeenCalled();
      expect(mockDogsTable.searchDogs).not.toHaveBeenCalled();
      expect(mockDogsTable.getAllDogs).not.toHaveBeenCalled();
    });
  });

  describe('online roster ignores the device queue', () => {
    it("shows the server's dogs only, whatever this device has queued or holds", async () => {
      server.dogs = { data: [serverRow('dog-b', 'Bree')], error: null };
      // An offline-created dog, a renamed one: neither is on the server yet.
      mockDogsTable.getAllDogs.mockResolvedValue([
        deviceDog('dog-new', 'Abby', { _localOnly: true }),
        deviceDog('dog-b', 'Bree Renamed'),
      ]);

      for (const read of reads.filter(r => r.name !== 'getDogStatistics')) {
        const { data } = await read.run();
        expect(
          (data as { id: string; name: string }[]).map(r => `${r.id}:${r.name}`),
          read.name
        ).toEqual(['dog-b:Bree']);
      }
      expect(mockDogsTable.getAllDogs).not.toHaveBeenCalled();
      expect(mockDogsTable.getUnsentMutationIdsForRow).not.toHaveBeenCalled();
    });

    it("uses the server's embedded registrations, not a merge with this device's queue", async () => {
      const embedded = { id: 'reg-1', dog_id: 'dog-b', organization: 'AKC' };
      server.dogs = {
        data: [serverRow('dog-b', 'Bree', { registrations: [embedded] })],
        error: null,
      };

      const { data } = await getAllDogs(PERSON);

      expect((data as { registrations: unknown[] }[])[0]?.registrations).toEqual([embedded]);
    });
  });

  describe('a roster larger than one response (showAll)', () => {
    const idOf = (i: number) => `dog-${String(i).padStart(5, '0')}`;
    const bigRoster = (count: number) =>
      Array.from({ length: count }, (_, i) => serverRow(idOf(i), `Dog ${i}`));

    it('reads every page, by keyset on id', async () => {
      server.dogs = { data: bigRoster(2005), error: null };

      const { data, error } = await getAllDogs(PERSON, true);

      expect(error).toBeNull();
      expect(ids(data)).toHaveLength(2005);
      expect(new Set(ids(data)).size).toBe(2005);
      expect(server.pages.map(page => page.after)).toEqual([undefined, idOf(999), idOf(1999)]);
    });

    it('returns the roster in name order', async () => {
      server.dogs = { data: [serverRow('b', 'Zeus'), serverRow('a', 'Abby')], error: null };
      expect((await getAllDogs(PERSON, true)).data).toEqual([
        expect.objectContaining({ name: 'Abby' }),
        expect.objectContaining({ name: 'Zeus' }),
      ]);
    });

    it('a dog deleted and a dog inserted between pages neither skips nor repeats a row', async () => {
      const rows = bigRoster(1500);
      const initialIds = rows.map(r => r.id);
      server.dogs = { data: rows, error: null };
      server.beforePage = pageNumber => {
        if (pageNumber !== 2) return;
        // After page 1 was read: delete one early dog and insert two before the cursor (offset
        // paging would then repeat or skip a row at the page boundary).
        const all = server.dogs.data as { id: string }[];
        all.splice(5, 1);
        all.push(serverRow('dog-00000a', 'Inserted early') as never);
        all.push(serverRow('dog-00000b', 'Inserted early 2') as never);
      };

      const { data, error } = await getAllDogs(PERSON, true);

      expect(error).toBeNull();
      const got = ids(data);
      expect(new Set(got).size).toBe(got.length);
      // Every dog that stayed on the server through the read is present.
      const stable = initialIds.filter(id => id !== idOf(5));
      for (const id of stable) expect(got).toContain(id);
    });

    it('a failed later page is an error, never a truncated roster', async () => {
      server.dogs = { data: bigRoster(1500), error: null };
      server.beforePage = pageNumber => {
        if (pageNumber === 2) server.dogs = { data: null, error: { code: '500', message: 'boom' } };
      };

      const { data, error } = await getAllDogs(PERSON, true);

      expect(error).not.toBeNull();
      expect(data).toEqual([]);
    });
  });
});
