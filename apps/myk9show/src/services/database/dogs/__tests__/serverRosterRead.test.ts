// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseError } from '@/services/database/databaseError';

/**
 * MYK9-1303: the server roster read no longer asks PostgREST for the
 * `owner:people(...)` and `registrations:dog_registrations(*)` embeds (a
 * `row_to_json` and a `json_agg` per dog, ~1 s a call under show-day load). It
 * reads plain `dogs` rows and attaches owners and registrations from batched
 * id lookups. The row must keep the shape the embeds gave the mappers.
 */

const { calls, db } = vi.hoisted(() => ({
  calls: [] as { table: string; columns: string; ids?: string[] }[],
  db: {
    dogs: [] as Record<string, unknown>[],
    people: [] as Record<string, unknown>[],
    registrations: [] as Record<string, unknown>[],
    registrationsError: null as { message: string } | null,
    peopleError: null as { message: string } | null,
  },
}));

vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: { getAllDogsWithStatus: vi.fn(), getDogsByOwner: vi.fn() },
}));
vi.mock('@/services/replication/ReplicatedDogRegistrationsTable', () => ({
  replicatedDogRegistrationsTable: {
    getRegistrationsForDogs: vi.fn(async () => []),
    getUnsentWorkForDogs: vi.fn(async () => []),
  },
}));
vi.mock('@/services/database/persistedAuthUserId', () => ({
  readPersistedAuthUserId: () => 'user-1',
}));
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: (table: string) => ({
      select: (columns: string) => {
        const call: { table: string; columns: string; ids?: string[] } = { table, columns };
        calls.push(call);
        const chain: Record<string, unknown> = {};
        for (const method of ['eq', 'or', 'is', 'order', 'gt', 'limit'])
          chain[method] = () => chain;
        chain.ilike = () => Promise.resolve({ data: [], error: null });
        chain.in = (_column: string, ids: string[]) => {
          call.ids = ids;
          if (table === 'people' && db.peopleError)
            return Promise.resolve({ data: null, error: db.peopleError });
          if (table === 'people')
            return Promise.resolve({
              data: db.people.filter(p => ids.includes(String(p.id))),
              error: null,
            });
          return Promise.resolve(
            db.registrationsError
              ? { data: null, error: db.registrationsError }
              : { data: db.registrations.filter(r => ids.includes(String(r.dog_id))), error: null }
          );
        };
        chain.then = (resolve: (v: unknown) => unknown, reject: (r: unknown) => unknown) =>
          Promise.resolve({ data: db.dogs, error: null }).then(resolve, reject);
        return chain;
      },
    }),
  },
  logQuery: vi.fn(),
  createDatabaseError,
}));

import { getAllDogs, getDogsByOwner, searchDogs } from '@/services/database/dogs';
import {
  clearOwnerNameCache,
  ownerNameCacheKey,
  recallOwnerNames,
} from '@/services/database/dogs/ownerNameCache';
import { mapDatabaseToDog } from '@/services/mappers/dogMappers';

const OWNER = {
  id: 'owner-1',
  first_name: 'Ada',
  last_name: 'Lovelace',
  email: 'ada@example.test',
  phone: '555-0100',
  street_address: '1 Main St',
  city: 'Town',
  state: 'TX',
  zip_code: '75001',
};
const REG = {
  dog_id: 'dog-1',
  id: 'reg-1',
  created_at: '2026-01-01T00:00:00Z',
  is_primary: true,
  registered_name: 'Ziva of Town',
  registration_number: 'DN1',
  registration_date: '2025-01-01',
  organization: 'AKC',
  variety: null,
  breed: 'Beagle',
  status: 'active',
};
const DOG = {
  id: 'dog-1',
  name: 'Ziva',
  call_name: 'Ziva',
  owner_id: 'owner-1',
  co_owner_id: null,
  deleted_at: null,
};

/** The row PostgREST returned with the embeds, which the mappers were written against. */
const embedShape = { ...DOG, owner: OWNER, registrations: [REG] };

describe('server roster read without embeds (MYK9-1303)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearOwnerNameCache();
    calls.length = 0;
    db.dogs = [DOG];
    db.people = [OWNER];
    db.registrations = [REG];
    db.registrationsError = null;
    db.peopleError = null;
  });

  it('asks for plain dogs rows: no owner or registrations embed on any of the three reads', async () => {
    await getAllDogs('owner-1', true);
    await getDogsByOwner('owner-1');
    await searchDogs('zi', 'owner-1');

    const dogSelects = calls.filter(c => c.table === 'dogs').map(c => c.columns);
    expect(dogSelects).toEqual(['*', '*', '*']);
  });

  it('getAllDogs returns the row the owner and registrations embeds returned', async () => {
    const { data, error } = await getAllDogs('owner-1', true);

    expect(error).toBeNull();
    expect(data).toEqual([embedShape]);
    expect(mapDatabaseToDog(data[0]!)).toEqual(mapDatabaseToDog(embedShape));
  });

  it('getDogsByOwner and searchDogs return dogs with registrations and no owner key, as before', async () => {
    const owned = await getDogsByOwner('owner-1');
    const found = await searchDogs('zi', 'owner-1');

    for (const result of [owned, found]) {
      expect(result.error).toBeNull();
      expect(result.data).toEqual([{ ...DOG, registrations: [REG] }]);
      expect('owner' in result.data[0]!).toBe(false);
    }
    expect(calls.some(c => c.table === 'people')).toBe(false);
  });

  it('a dog with no owner row or registrations reads owner null and an empty list', async () => {
    db.dogs = [{ ...DOG, owner_id: null }];
    db.registrations = [];

    const { data } = await getAllDogs('owner-1', true);

    expect(data).toEqual([{ ...DOG, owner_id: null, owner: null, registrations: [] }]);
  });

  it('remembers the owner names the list shows, for the offline read', async () => {
    await getAllDogs('owner-1', true);

    const recalled = recallOwnerNames(['owner-1'], ownerNameCacheKey());
    expect(recalled.get('owner-1')).toMatchObject({ first_name: 'Ada', last_name: 'Lovelace' });
  });

  it('reads owners and registrations in batches of at most 100 ids', async () => {
    db.dogs = Array.from({ length: 250 }, (_, i) => ({
      ...DOG,
      id: `dog-${i}`,
      owner_id: `o-${i}`,
    }));
    db.people = [];
    db.registrations = [];

    await getAllDogs('owner-1', true);

    for (const table of ['people', 'dog_registrations']) {
      const sizes = calls.filter(c => c.table === table).map(c => c.ids?.length);
      expect(sizes, table).toEqual([100, 100, 50]);
    }
  });

  it('a registrations read failure fails the read, as the embed did', async () => {
    db.registrationsError = { message: 'permission denied for table dog_registrations' };

    for (const result of [
      await getAllDogs('owner-1', true),
      await getDogsByOwner('owner-1'),
      await searchDogs('zi', 'owner-1'),
    ]) {
      expect(result.error).not.toBeNull();
      expect(result.data).toEqual([]);
    }
  });

  it('an owner read the server ANSWERED with an error fails the read, not blank owners', async () => {
    db.peopleError = { message: 'permission denied for table people' };

    const result = await getAllDogs('owner-1', true);

    expect(result.error).not.toBeNull();
    expect(result.data).toEqual([]);
  });

  it('an owner read that could not reach the server degrades, flagged', async () => {
    db.peopleError = { message: 'Failed to fetch' };

    const { data, error } = await getAllDogs('owner-1', true);

    expect(error).toBeNull();
    expect(data[0]).toMatchObject({ owner: null, owner_unavailable_offline: true });
  });

  it('reads the batches in parallel', async () => {
    db.dogs = Array.from({ length: 250 }, (_, i) => ({
      ...DOG,
      id: `dog-${i}`,
      owner_id: `o-${i}`,
    }));
    const open = { now: 0, max: 0 };
    const original = db.people;
    Object.defineProperty(db, 'people', {
      configurable: true,
      get() {
        open.now += 1;
        open.max = Math.max(open.max, open.now);
        queueMicrotask(() => {
          open.now -= 1;
        });
        return original;
      },
    });

    try {
      await getAllDogs('owner-1', true);
      expect(open.max).toBeGreaterThan(1);
    } finally {
      Object.defineProperty(db, 'people', { configurable: true, writable: true, value: original });
    }
  });
});
