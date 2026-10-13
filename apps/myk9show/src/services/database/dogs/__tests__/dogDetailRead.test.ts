import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseError } from '@/services/database/databaseError';
import type { ReplicatedDog } from '@/services/replication/ReplicatedDogsTable';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';

/**
 * MYK9-1126: the dog page reads the server first. The replica answers only
 * when the server cannot be reached; this account's own pending edit is laid
 * over the server row; a server error is an error.
 */

const { server, mockDogsTable, mockEntriesTable, mockRegistrationsTable } = vi.hoisted(() => ({
  /** What `dogs ... .single()` resolves to; `throws` simulates a rejected fetch. */
  server: {
    detail: { data: null, error: null } as { data: unknown; error: unknown },
    throws: null as Error | null,
    /** `dog_registrations` rows, for the roster's and the registration read. */
    registrations: [] as Record<string, unknown>[],
  },
  mockDogsTable: {
    getAllDogsWithStatus: vi.fn(),
    getDogById: vi.fn(),
    getPendingMutationIdsForRow: vi.fn(),
  },
  mockEntriesTable: { getAllOrThrow: vi.fn() },
  mockRegistrationsTable: {
    getRegistrationsForDogs: vi.fn(),
    getUnsentRegistrationsForDogs: vi.fn(),
  },
}));

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
        const isDetail = table === 'dogs' && columns.includes('entries(');
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
          in: () => settle(),
          single: () => settle(),
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
  entries: [{ id: 'entry-server', dog_id: 'dog-1' }],
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
    mockDogsTable.getDogById.mockReset();
    mockDogsTable.getDogById.mockResolvedValue(replicaDog());
    mockDogsTable.getPendingMutationIdsForRow.mockReset();
    mockDogsTable.getPendingMutationIdsForRow.mockResolvedValue([]);
    mockEntriesTable.getAllOrThrow.mockReset();
    mockEntriesTable.getAllOrThrow.mockResolvedValue([
      { id: 'entry-device', dogId: 'dog-1' } as ReplicatedEntry,
    ]);
    mockRegistrationsTable.getRegistrationsForDogs.mockReset();
    mockRegistrationsTable.getRegistrationsForDogs.mockResolvedValue([]);
    mockRegistrationsTable.getUnsentRegistrationsForDogs.mockReset();
    mockRegistrationsTable.getUnsentRegistrationsForDogs.mockResolvedValue([]);
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

  it('server unreachable: the device copy answers, with its entries', async () => {
    server.throws = new TypeError('Failed to fetch');

    const { data, error } = await getDogById('dog-1');

    expect(error).toBeNull();
    const row = data as Record<string, unknown>;
    expect(row.name).toBe('Device Name');
    expect(row.microchip_number).toBe('999');
    expect((row.entries as { id: string }[]).map(e => e.id)).toEqual(['entry-device']);
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
    mockDogsTable.getPendingMutationIdsForRow.mockResolvedValue(['mutation-1']);

    const { data, error } = await getDogById('dog-1');

    expect(error).toBeNull();
    const row = data as Record<string, unknown>;
    expect(row.name).toBe('Device Name');
    expect(row.microchip_number).toBe('999');
    // Owner and entries still come from the server.
    expect(row.owner).toEqual(SERVER_ROW.owner);
    expect(row.entries).toEqual(SERVER_ROW.entries);
  });

  it("online, this account's unsent create (not on the server yet) is shown from the device", async () => {
    server.detail = { data: null, error: { code: 'PGRST116', message: 'no rows' } };
    mockDogsTable.getPendingMutationIdsForRow.mockResolvedValue(['mutation-create']);

    const { data, error } = await getDogById('dog-1');

    expect(error).toBeNull();
    expect((data as Record<string, unknown>).name).toBe('Device Name');
  });

  it('online, unsent registrations are merged into the server row', async () => {
    server.detail = { data: SERVER_ROW, error: null };
    mockRegistrationsTable.getUnsentRegistrationsForDogs.mockResolvedValue([
      {
        id: 'registration-local-1',
        dog_id: 'dog-1',
        organization: 'AKC',
        registration_number: 'SW123456',
      },
    ]);

    const { data } = await getDogById('dog-1');

    expect((data as Record<string, unknown>).registrations).toEqual([
      expect.objectContaining({ id: 'registration-local-1', registration_number: 'SW123456' }),
    ]);
  });
  it('detail and roster resolve the same primary registration when server timestamps tie', async () => {
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
    mockRegistrationsTable.getUnsentRegistrationsForDogs.mockResolvedValue([
      {
        id: 'local-ukc',
        dog_id: 'dog-1',
        organization: 'UKC',
        registration_number: 'U2',
        breed: 'Harrier',
        created_at: '2026-10-01T11:00:00.000Z',
      },
      {
        id: 'local-akc',
        dog_id: 'dog-1',
        organization: 'AKC',
        registration_number: 'SW1',
        breed: 'Beagle',
        created_at: '2026-10-01T11:00:01.000Z',
      },
    ]);
    server.detail = { data: { ...SERVER_ROW, registrations: server.registrations }, error: null };
    mockDogsTable.getAllDogsWithStatus.mockResolvedValue({ rows: [replicaDog()], cold: false });

    const detail = await getDogById('dog-1');
    const roster = await getAllDogs('person-1');

    const detailDog = mapDatabaseToDog(detail.data as Record<string, unknown>);
    const rosterDog = mapDatabaseToDog((roster.data as Record<string, unknown>[])[0]!);
    expect(rosterDog.breed).toBe('Harrier');
    expect(detailDog.breed).toBe(rosterDog.breed);
  });
});
