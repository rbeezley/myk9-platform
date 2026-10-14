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

const { server, mockDogsTable, mockRegistrationsTable } = vi.hoisted(() => ({
  server: {
    /** What the `dogs` list query resolves to. */
    dogs: { data: [], error: null, count: null } as {
      data: unknown;
      error: unknown;
      count?: number | null;
    },
    /** Ids the follow-up `dogs ... in(id, ...)` lookup (statistics dedupe) finds. */
    idsOnServer: [] as string[],
    /** The `dog_registrations` read: rows, or an error that fails it. */
    registrations: { data: [], error: null } as { data: unknown; error: unknown },
    /** Every `.range(from, to)` the dogs list read asked for. */
    ranges: [] as [number, number][],
  },
  mockRegistrationsTable: { getUnsentWorkForDogs: vi.fn() },
  mockDogsTable: {
    getAllDogsWithStatus: vi.fn(),
    getAllDogs: vi.fn(),
    getDogsByOwner: vi.fn(),
    searchDogs: vi.fn(),
    getUnsentRowIds: vi.fn(),
  },
}));

vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: mockDogsTable,
}));
vi.mock('@/services/replication/ReplicatedDogRegistrationsTable', () => ({
  replicatedDogRegistrationsTable: {
    getRegistrationsForDogs: vi.fn(async () => []),
    getUnsentWorkForDogs: (...args: unknown[]) =>
      mockRegistrationsTable.getUnsentWorkForDogs(...args),
  },
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: (table: string) => ({
      select: (columns?: string) => {
        const isIdLookup =
          table === 'dogs' && columns === 'id' && !String(columns).includes('count');
        let idFilter = false;
        const chain: Record<string, unknown> = {};
        for (const method of ['eq', 'or', 'is', 'order', 'ilike']) chain[method] = () => chain;
        chain.in = (column: string) => {
          if (table === 'dogs' && column === 'id') {
            idFilter = true;
            return chain;
          }
          // Registrations (or owners).
          return Promise.resolve(
            table === 'dog_registrations' ? server.registrations : { data: [], error: null }
          );
        };
        chain.range = (from: number, to: number) => {
          server.ranges.push([from, to]);
          const { data, error } = server.dogs;
          return Promise.resolve({
            data: Array.isArray(data) ? data.slice(from, to + 1) : data,
            error,
          });
        };
        chain.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve(
            idFilter && isIdLookup
              ? { data: server.idsOnServer.map(id => ({ id })), error: null }
              : table === 'dogs'
                ? server.dogs
                : { data: [], error: null }
          ).then(resolve, reject);
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
    server.idsOnServer = [];
    server.registrations = { data: [], error: null };
    server.ranges = [];
    mockRegistrationsTable.getUnsentWorkForDogs.mockReset();
    mockRegistrationsTable.getUnsentWorkForDogs.mockResolvedValue([]);
    for (const fn of Object.values(mockDogsTable)) fn.mockReset();
    // A warm replica holding only account A's dog.
    mockDogsTable.getAllDogsWithStatus.mockResolvedValue({ rows: [FOREIGN_DOG], cold: false });
    mockDogsTable.getAllDogs.mockResolvedValue([FOREIGN_DOG]);
    mockDogsTable.getDogsByOwner.mockResolvedValue([]);
    mockDogsTable.searchDogs.mockResolvedValue([FOREIGN_DOG]);
    mockDogsTable.getUnsentRowIds.mockResolvedValue(new Set<string>());
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

  describe("this account's unsent dog work is laid over the server rows", () => {
    beforeEach(() => {
      server.dogs = { data: [serverRow('dog-b', 'Bree')], error: null };
    });

    it('shows an offline-created dog the server has not seen, in name order', async () => {
      const created = deviceDog('dog-new', 'Abby', { _localOnly: true });
      mockDogsTable.getAllDogs.mockResolvedValue([FOREIGN_DOG, created]);
      mockDogsTable.getUnsentRowIds.mockResolvedValue(new Set(['dog-new']));

      const { data, error } = await getAllDogs(PERSON);

      expect(error).toBeNull();
      expect(ids(data)).toEqual(['dog-new', 'dog-b']);
    });

    it("replaces the server's version of a dog with the unsent edit, keeping the server's owner", async () => {
      server.dogs = {
        data: [serverRow('dog-b', 'Bree', { owner: { id: PERSON, first_name: 'Bo' } })],
        error: null,
      };
      mockDogsTable.getAllDogs.mockResolvedValue([deviceDog('dog-b', 'Bree Renamed')]);
      mockDogsTable.getUnsentRowIds.mockResolvedValue(new Set(['dog-b']));

      const { data } = await getAllDogs(PERSON);

      const rows = data as { id: string; name: string; owner: { first_name: string } }[];
      expect(rows).toHaveLength(1);
      expect(rows[0]?.name).toBe('Bree Renamed');
      expect(rows[0]?.owner.first_name).toBe('Bo');
    });

    it('does not add an unsent dog that another owner holds, unless the roster is showAll', async () => {
      const foreignUnsent = deviceDog('dog-x', 'Xena', { ownerId: 'person-x' });
      mockDogsTable.getAllDogs.mockResolvedValue([foreignUnsent]);
      mockDogsTable.getUnsentRowIds.mockResolvedValue(new Set(['dog-x']));

      expect(ids((await getAllDogs(PERSON)).data)).toEqual(['dog-b']);
      expect(ids((await getAllDogs(PERSON, true)).data)).toEqual(['dog-b', 'dog-x']);
    });

    it('lists the queue once, not once per replica row', async () => {
      mockDogsTable.getAllDogs.mockResolvedValue([FOREIGN_DOG, deviceDog('d1', 'D1')]);
      await getAllDogs(PERSON);
      expect(mockDogsTable.getUnsentRowIds).toHaveBeenCalledTimes(1);
    });

    it('getDogsByOwner adds the unsent dog this owner created offline', async () => {
      mockDogsTable.getAllDogs.mockResolvedValue([deviceDog('dog-new', 'Abby')]);
      mockDogsTable.getUnsentRowIds.mockResolvedValue(new Set(['dog-new']));

      expect(ids((await getDogsByOwner(PERSON)).data)).toEqual(['dog-new', 'dog-b']);
    });

    it('searchDogs adds an unsent dog only when it matches the search term', async () => {
      mockDogsTable.getAllDogs.mockResolvedValue([
        deviceDog('dog-new', 'Abby'),
        deviceDog('dog-other', 'Rex'),
      ]);
      mockDogsTable.getUnsentRowIds.mockResolvedValue(new Set(['dog-new', 'dog-other']));

      expect(ids((await searchDogs('abb', PERSON)).data)).toEqual(['dog-new', 'dog-b']);
    });

    it('getDogStatistics counts an unsent create the server does not have, once', async () => {
      server.dogs = { data: null, error: null, count: 2 };
      mockDogsTable.getAllDogs.mockResolvedValue([
        deviceDog('dog-new', 'Abby'),
        deviceDog('dog-landed', 'Lando'),
      ]);
      mockDogsTable.getUnsentRowIds.mockResolvedValue(new Set(['dog-new', 'dog-landed']));
      // dog-landed's upload already landed, so the server count includes it.
      server.idsOnServer = ['dog-landed'];

      expect((await getDogStatistics(PERSON)).data).toEqual({ total: 3 });
    });

    it('an unreadable queue leaves the server rows as they are', async () => {
      mockDogsTable.getUnsentRowIds.mockRejectedValue(new Error('queue unreadable'));

      const { data, error } = await getAllDogs(PERSON);

      expect(error).toBeNull();
      expect(ids(data)).toEqual(['dog-b']);
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

  describe('Codex review of #2969', () => {
    it('getAllDogs (showAll) reads every page: the server caps one response at 1000 rows', async () => {
      server.dogs = {
        data: Array.from({ length: 1005 }, (_, i) =>
          serverRow(`dog-${String(i).padStart(4, '0')}`, `Dog ${i}`)
        ),
        error: null,
      };

      const { data, error } = await getAllDogs(PERSON, true);

      expect(error).toBeNull();
      expect(ids(data)).toHaveLength(1005);
      expect(server.ranges).toEqual([
        [0, 999],
        [1000, 1999],
      ]);
    });

    it('a failed later page is an error, never a truncated roster', async () => {
      const rows = Array.from({ length: 1000 }, (_, i) => serverRow(`dog-${i}`, `Dog ${i}`));
      let calls = 0;
      server.dogs = {
        get data() {
          calls++;
          return calls === 1 ? rows : null;
        },
        get error() {
          return calls === 1 ? null : { code: '500', message: 'boom' };
        },
      } as never;

      const { data, error } = await getAllDogs(PERSON, true);

      expect(error).not.toBeNull();
      expect(data).toEqual([]);
    });

    it('keeps unsent registration work when the registrations read fails, and says it is incomplete', async () => {
      const embedded = {
        id: 'reg-1',
        dog_id: 'dog-b',
        organization: 'AKC',
        registration_number: 'A1',
      };
      server.dogs = {
        data: [serverRow('dog-b', 'Bree', { registrations: [embedded] })],
        error: null,
      };
      server.registrations = {
        data: null,
        error: { code: '500', message: 'registrations failed' },
      };
      mockRegistrationsTable.getUnsentWorkForDogs.mockResolvedValue([
        {
          id: 'local-ukc',
          dogId: 'dog-b',
          organization: 'UKC',
          registrationNumber: 'U2',
          breed: 'Beagle',
          _localOnly: true,
          _queuedAdd: true,
        },
      ]);

      const { data } = await getAllDogs(PERSON);

      const row = (
        data as { registrations: { id: string }[]; registrations_read_complete: boolean }[]
      )[0]!;
      expect(row.registrations.map(r => r.id).sort()).toEqual(['local-ukc', 'reg-1']);
      expect(row.registrations_read_complete).toBe(false);
    });

    it('drops a server row whose pending rename no longer matches the search', async () => {
      server.dogs = { data: [serverRow('dog-b', 'Alpha')], error: null };
      mockDogsTable.getAllDogs.mockResolvedValue([deviceDog('dog-b', 'Rex', { callName: 'Rex' })]);
      mockDogsTable.getUnsentRowIds.mockResolvedValue(new Set(['dog-b']));

      expect(ids((await searchDogs('alpha', PERSON)).data)).toEqual([]);
      expect(ids((await searchDogs('rex', PERSON)).data)).toEqual(['dog-b']);
    });

    it('drops a server row whose pending edit moved it to another owner (getDogsByOwner)', async () => {
      server.dogs = { data: [serverRow('dog-b', 'Bree')], error: null };
      mockDogsTable.getAllDogs.mockResolvedValue([
        deviceDog('dog-b', 'Bree', { ownerId: 'person-x' }),
      ]);
      mockDogsTable.getUnsentRowIds.mockResolvedValue(new Set(['dog-b']));

      expect(ids((await getDogsByOwner(PERSON)).data)).toEqual([]);
    });

    it('keeps a co-owned dog with a pending edit in the own-dogs roster', async () => {
      server.dogs = {
        data: [serverRow('dog-b', 'Bree', { owner_id: 'person-x', co_owner_id: PERSON })],
        error: null,
      };
      mockDogsTable.getAllDogs.mockResolvedValue([
        deviceDog('dog-b', 'Bree 2', { ownerId: 'person-x' }),
      ]);
      mockDogsTable.getUnsentRowIds.mockResolvedValue(new Set(['dog-b']));

      const { data } = await getAllDogs(PERSON);

      expect((data as { name: string }[]).map(r => r.name)).toEqual(['Bree 2']);
    });
  });
});
