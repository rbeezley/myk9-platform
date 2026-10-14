import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseError } from '@/services/database/databaseError';
import type { ReplicatedDog } from '@/services/replication/ReplicatedDogsTable';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';

/**
 * MYK9-1126: the dog page reads the server first. The replica answers only
 * when the server cannot be reached; this account's own pending edit is laid
 * over the server row; a server error is an error.
 */

const { server, selects, mockDogsTable, mockEntriesTable, mockRegistrationsTable } = vi.hoisted(
  () => ({
    /** What `dogs ... .single()` resolves to; `throws` simulates a rejected fetch. */
    server: {
      detail: { data: null, error: null } as { data: unknown; error: unknown },
      throws: null as Error | null,
      /** `dog_registrations` rows, for the roster's and the registration read. */
      registrations: [] as Record<string, unknown>[],
      /** What the roster's `dogs` list query (no `.single()`) answers. */
      roster: [] as Record<string, unknown>[],
      /** When set, the roster's list read fails with it (a network failure). */
      rosterError: null as { message: string } | null,
    },
    /** Every select the read sends, by table. */
    selects: [] as { table: string; columns: string }[],
    mockDogsTable: {
      getAllDogsWithStatus: vi.fn(),
      getDogById: vi.fn(),
      getUnsentMutationIdsForRow: vi.fn(),
    },
    mockEntriesTable: { getAllOrThrow: vi.fn() },
    mockRegistrationsTable: {
      getRegistrationsForDogs: vi.fn(),
      getUnsentWorkForDogs: vi.fn(),
    },
  })
);

vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: mockDogsTable,
}));
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: mockEntriesTable,
}));
vi.mock('@/services/replication/ReplicatedDogRegistrationsTable', () => ({
  replicatedDogRegistrationsTable: mockRegistrationsTable,
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: (table: string) => ({
      select: (columns: string) => {
        selects.push({ table, columns });
        // The detail read is the one `dogs` select that starts with `*`.
        const isDetail = table === 'dogs' && columns.trim().startsWith('*');
        const settle = () => {
          if (isDetail && server.throws) return Promise.reject(server.throws);
          if (isDetail) return Promise.resolve(server.detail);
          // The device path's owner/health supplement, owners and registrations.
          if (table === 'dog_registrations') {
            return Promise.resolve({ data: server.registrations, error: null });
          }
          return Promise.resolve({ data: table === 'dogs' ? null : [], error: null });
        };
        const chain: Record<string, unknown> = {
          eq: () => chain,
          is: () => chain,
          or: () => chain,
          order: () => chain,
          in: () => settle(),
          single: () => settle(),
          // The roster's list read: the server's dogs, awaited as a chain.
          then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
            Promise.resolve({
              data: server.rosterError ? null : server.roster,
              error: server.rosterError,
            }).then(resolve, reject),
        };
        return chain;
      },
    }),
  },
  logQuery: vi.fn(),
  createDatabaseError,
}));

import { getAllDogs, getDogById } from '@/services/database/dogs';
import { mapDatabaseToDog } from '@/services/mappers/dogMappers';

const SERVER_ROW = {
  id: 'dog-1',
  name: 'Server Name',
  call_name: 'Server',
  owner_id: 'person-1',
  microchip_number: '111',
  owner: { id: 'person-1', first_name: 'Pat', last_name: 'Owner' },
  registrations: [],
  health_records: [],
};

function replicaDog(overrides: Partial<ReplicatedDog> = {}): ReplicatedDog {
  return {
    id: 'dog-1',
    name: 'Device Name',
    callName: 'Device',
    breed: 'Beagle',
    ownerId: 'person-1',
    microchipNumber: '999',
    ...overrides,
  };
}

describe('getDogById reads the server first (MYK9-1126)', () => {
  beforeEach(() => {
    server.detail = { data: null, error: null };
    server.throws = null;
    server.registrations = [];
    server.roster = [];
    server.rosterError = null;
    mockDogsTable.getDogById.mockReset();
    mockDogsTable.getDogById.mockResolvedValue(replicaDog());
    selects.length = 0;
    mockDogsTable.getUnsentMutationIdsForRow.mockReset();
    mockDogsTable.getUnsentMutationIdsForRow.mockResolvedValue([]);
    mockEntriesTable.getAllOrThrow.mockReset();
    mockEntriesTable.getAllOrThrow.mockResolvedValue([
      { id: 'entry-device', dogId: 'dog-1' } as ReplicatedEntry,
    ]);
    mockRegistrationsTable.getRegistrationsForDogs.mockReset();
    mockRegistrationsTable.getRegistrationsForDogs.mockResolvedValue([]);
    mockRegistrationsTable.getUnsentWorkForDogs.mockReset();
    mockRegistrationsTable.getUnsentWorkForDogs.mockResolvedValue([]);
  });

  it('online, the server row wins over a different clean replica copy', async () => {
    server.detail = { data: SERVER_ROW, error: null };

    const { data, error } = await getDogById('dog-1');

    expect(error).toBeNull();
    // Registrations come from the roster's registration read (none here).
    expect(data).toEqual({ ...SERVER_ROW, registrations: [], registrations_read_complete: true });
    expect(mockDogsTable.getDogById).not.toHaveBeenCalled();
    expect(mockEntriesTable.getAllOrThrow).not.toHaveBeenCalled();
  });

  it("online, another account's replica row the server does not return is never shown", async () => {
    mockDogsTable.getDogById.mockResolvedValue(replicaDog({ id: 'dog-a', ownerId: 'person-a' }));
    server.detail = { data: null, error: { code: 'PGRST116', message: 'no rows' } };

    const { data, error } = await getDogById('dog-a');

    expect(data).toBeNull();
    expect(error?.code).toBe('PGRST116');
    expect(mockDogsTable.getDogById).not.toHaveBeenCalled();
  });

  it('server unreachable: the device copy answers, without replica entries', async () => {
    server.throws = new TypeError('Failed to fetch');

    const { data, error } = await getDogById('dog-1');

    expect(error).toBeNull();
    const row = data as Record<string, unknown>;
    expect(row.name).toBe('Device Name');
    expect(row.microchip_number).toBe('999');
    // Entries are the dog page's own read (getEntriesByDog), never this row's.
    expect(row.entries).toBeUndefined();
    expect(mockEntriesTable.getAllOrThrow).not.toHaveBeenCalled();
  });

  it('server unreachable and the dog is not on this device: an error, not a missing dog', async () => {
    server.throws = new TypeError('Failed to fetch');
    mockDogsTable.getDogById.mockResolvedValue(null);

    const { data, error } = await getDogById('dog-1');

    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it('a server error that is not unreachable is returned, never the replica or an empty dog', async () => {
    server.detail = { data: null, error: { code: '42501', message: 'permission denied' } };

    const { data, error } = await getDogById('dog-1');

    expect(data).toBeNull();
    expect(error?.code).toBe('42501');
    expect(mockDogsTable.getDogById).not.toHaveBeenCalled();
  });

  it("online, this account's pending edit is laid over the server row", async () => {
    server.detail = { data: SERVER_ROW, error: null };
    mockDogsTable.getUnsentMutationIdsForRow.mockResolvedValue(['mutation-1']);

    const { data, error } = await getDogById('dog-1');

    expect(error).toBeNull();
    const row = data as Record<string, unknown>;
    expect(row.name).toBe('Device Name');
    expect(row.microchip_number).toBe('999');
    // The owner still comes from the server.
    expect(row.owner).toEqual(SERVER_ROW.owner);
  });

  it("online, this account's unsent create (not on the server yet) is shown from the device", async () => {
    server.detail = { data: null, error: { code: 'PGRST116', message: 'no rows' } };
    mockDogsTable.getUnsentMutationIdsForRow.mockResolvedValue(['mutation-create']);

    const { data, error } = await getDogById('dog-1');

    expect(error).toBeNull();
    expect((data as Record<string, unknown>).name).toBe('Device Name');
  });

  it('online, unsent registrations are merged into the server row', async () => {
    server.detail = { data: SERVER_ROW, error: null };
    mockRegistrationsTable.getUnsentWorkForDogs.mockResolvedValue([
      {
        id: 'registration-local-1',
        _localOnly: true,
        dogId: 'dog-1',
        organization: 'AKC',
        registrationNumber: 'SW123456',
      },
    ]);

    const { data } = await getDogById('dog-1');

    expect((data as Record<string, unknown>).registrations).toEqual([
      expect.objectContaining({ id: 'registration-local-1', registration_number: 'SW123456' }),
    ]);
  });
  it('detail and the device roster resolve the same primary registration when server timestamps tie', async () => {
    // create_dog_with_registrations stamps every row with one instant, so the
    // server rows tie and the id tiebreak would pick AKC. This device's
    // placeholders hold the real creation order: UKC first. Both reads must
    // carry that order over (overlayLocalCreationOrder) and agree.
    const tied = '2026-10-01T12:00:00+00:00';
    server.registrations = [
      {
        id: 'reg-a',
        dog_id: 'dog-1',
        organization: 'AKC',
        registration_number: 'SW1',
        breed: 'Beagle',
        created_at: tied,
        is_primary: false,
        status: 'active',
      },
      {
        id: 'reg-b',
        dog_id: 'dog-1',
        organization: 'UKC',
        registration_number: 'U2',
        breed: 'Harrier',
        created_at: tied,
        is_primary: false,
        status: 'active',
      },
    ];
    mockRegistrationsTable.getUnsentWorkForDogs.mockResolvedValue([
      {
        id: 'local-ukc',
        _localOnly: true,
        dogId: 'dog-1',
        organization: 'UKC',
        registrationNumber: 'U2',
        breed: 'Harrier',
        createdAt: '2026-10-01T11:00:00.000Z',
      },
      {
        id: 'local-akc',
        _localOnly: true,
        dogId: 'dog-1',
        organization: 'AKC',
        registrationNumber: 'SW1',
        breed: 'Beagle',
        createdAt: '2026-10-01T11:00:01.000Z',
      },
    ]);
    server.detail = { data: { ...SERVER_ROW, registrations: server.registrations }, error: null };
    // The roster's online rows show the server's registrations with no merge of
    // this device's queue (MYK9-1139); the device copy, read when the server
    // cannot be reached, merges it, and must agree with the dog page.
    server.rosterError = { message: 'Failed to fetch' };
    mockDogsTable.getAllDogsWithStatus.mockResolvedValue({ rows: [replicaDog()], cold: false });

    const detail = await getDogById('dog-1');
    const roster = await getAllDogs('person-1');

    const detailDog = mapDatabaseToDog(detail.data as Record<string, unknown>);
    const rosterDog = mapDatabaseToDog((roster.data as Record<string, unknown>[])[0]!);
    expect(rosterDog.breed).toBe('Harrier');
    expect(detailDog.breed).toBe(rosterDog.breed);
  });

  it('never embeds entries: authenticated users hold only column-level SELECT on entries', async () => {
    server.detail = { data: SERVER_ROW, error: null };

    await getDogById('dog-1');
    server.throws = new TypeError('Failed to fetch');
    await getDogById('dog-1');

    const dogSelects = selects.filter(select => select.table === 'dogs');
    expect(dogSelects.length).toBeGreaterThan(0);
    for (const { columns } of dogSelects) expect(columns).not.toMatch(/entries\s*\(/);
    expect(selects.some(select => select.table === 'entries')).toBe(false);
  });

  it("online, this account's FAILED upload is still laid over the server row", async () => {
    // Retries exhausted: the mutation moved to failed_mutations and the device
    // keeps the edit for Retry or Discard, so the page must not revert it.
    server.detail = { data: SERVER_ROW, error: null };
    mockDogsTable.getUnsentMutationIdsForRow.mockResolvedValue(['failed-1']);

    const { data } = await getDogById('dog-1');

    expect((data as Record<string, unknown>).name).toBe('Device Name');
  });
});
