import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseError } from '@/services/database/databaseError';
import type { ReplicatedDog } from '@/services/replication/ReplicatedDogsTable';

/**
 * MYK9-1010: the owner's address must reach `Dog.owner` through the REAL roster
 * read (`getAllDogs`, both paths) and the REAL mapper, or the class-selection
 * block reads an absent address as "unknown" and never fires (LESSONS
 * last-hop-drop). The server rows below are the shape PostgREST returns for the
 * columns the read asks for; the mock answers only the columns it was asked.
 */

const { selects, mockDogsTable, peopleRows, postgrestDogRows } = vi.hoisted(() => ({
  selects: [] as { table: string; columns: string }[],
  mockDogsTable: { getAllDogsWithStatus: vi.fn() },
  peopleRows: [] as Record<string, unknown>[],
  postgrestDogRows: [] as Record<string, unknown>[],
}));

vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: mockDogsTable,
}));
vi.mock('@/services/replication/ReplicatedDogRegistrationsTable', () => ({
  replicatedDogRegistrationsTable: { getRegistrationsForDogs: vi.fn(async () => []) },
}));

/** Keep only the columns a select string names, as PostgREST would. */
function project(row: Record<string, unknown>, columns: string): Record<string, unknown> {
  const names = columns.split(',').map(c => c.trim());
  return Object.fromEntries(Object.entries(row).filter(([key]) => names.includes(key)));
}

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: (table: string) => ({
      select: (columns: string) => {
        selects.push({ table, columns });
        const rows =
          table === 'people' ? peopleRows.map(row => project(row, columns)) : postgrestDogRows;
        const result = Promise.resolve({ data: table === 'dog_registrations' ? [] : rows, error: null });
        const chain: Record<string, unknown> = {
          in: () => result,
          is: () => chain,
          or: () => chain,
          order: () => chain,
          then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
            result.then(resolve, reject),
        };
        return chain;
      },
    }),
  },
  logQuery: vi.fn(),
  createDatabaseError,
}));

import { getAllDogs } from '@/services/database/dogs';
import { mapDatabaseToDog } from '@/services/mappers/dogMappers';

const OWNER_ROW = {
  id: 'person-1',
  first_name: 'Pat',
  last_name: 'Owner',
  email: 'pat@example.test',
  phone: '555-0100',
  street_address: '12 Elm St',
  city: 'Springfield',
  state: 'IL',
  zip_code: '62701',
};

function replicatedDog(): ReplicatedDog {
  return {
    id: 'dog-1',
    name: 'Bella',
    callName: 'Bell',
    breed: 'Golden Retriever',
    sex: 'female',
    ownerId: 'person-1',
  } as ReplicatedDog;
}

describe('owner address on the dog roster read (MYK9-1010)', () => {
  beforeEach(() => {
    selects.length = 0;
    peopleRows.length = 0;
    postgrestDogRows.length = 0;
    mockDogsTable.getAllDogsWithStatus.mockReset();
  });

  it('replication path: the owner batch read carries the address to Dog.owner', async () => {
    mockDogsTable.getAllDogsWithStatus.mockResolvedValue({ rows: [replicatedDog()], cold: false });
    peopleRows.push(OWNER_ROW);

    const { data } = await getAllDogs('person-1');
    const dog = mapDatabaseToDog((data as Record<string, unknown>[])[0]!);

    expect(dog.owner).toEqual({
      id: 'person-1',
      name: 'Pat Owner',
      email: 'pat@example.test',
      phone: '555-0100',
      streetAddress: '12 Elm St',
      city: 'Springfield',
      state: 'IL',
      zipCode: '62701',
    });
    expect(dog.ownerName).toBe('Pat Owner');
  });

  it('PostgREST fallback: the owner embed asks for the address columns', async () => {
    mockDogsTable.getAllDogsWithStatus.mockResolvedValue({ rows: [], cold: true });
    postgrestDogRows.push({
      id: 'dog-1',
      name: 'Bella',
      call_name: 'Bell',
      owner_id: 'person-1',
      owner: OWNER_ROW,
      registrations: [],
    });

    const { data } = await getAllDogs('person-1');
    const dogsSelect = selects.find(s => s.table === 'dogs')?.columns ?? '';
    for (const column of ['street_address', 'city', 'state', 'zip_code']) {
      expect(dogsSelect).toContain(column);
    }
    const dog = mapDatabaseToDog((data as Record<string, unknown>[])[0]!);
    expect(dog.owner?.streetAddress).toBe('12 Elm St');
    expect(dog.owner?.zipCode).toBe('62701');
  });

  it('a dog whose owner was not read has no owner object, not an empty address', async () => {
    mockDogsTable.getAllDogsWithStatus.mockResolvedValue({ rows: [replicatedDog()], cold: false });

    const { data } = await getAllDogs('person-1');
    const dog = mapDatabaseToDog((data as Record<string, unknown>[])[0]!);

    expect(dog.owner).toBeUndefined();
  });
});
