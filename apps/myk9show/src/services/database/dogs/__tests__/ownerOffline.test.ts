// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseError } from '@/services/database/databaseError';
import type { ReplicatedDog } from '@/services/replication/ReplicatedDogsTable';

/**
 * MYK9-1189: `people` is not replicated, so the offline dogs list used to show
 * no owner at all. Online reads leave the owner names on the device; the
 * offline read uses them, and says so when an owner was never seen.
 */

const { server, mockDogsTable } = vi.hoisted(() => ({
  server: {
    online: true,
    dogs: [] as unknown[],
    userId: 'user-1' as string | null,
    /** Signs a different account in while the dogs read is in flight. */
    switchToDuringRead: null as string | null,
    /** Signs the account out while the dogs read is in flight. */
    signOutDuringRead: false,
    /** Overrides the people read's error (an answered server error, not an outage). */
    peopleError: null as { message: string } | null,
  },
  mockDogsTable: { getAllDogsWithStatus: vi.fn() },
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
vi.mock('@/services/database/persistedAuthUserId', () => ({
  readPersistedAuthUserId: () => server.userId,
}));
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => {
        const chain: Record<string, unknown> = {};
        for (const method of ['eq', 'or', 'is', 'order', 'gt', 'limit'])
          chain[method] = () => chain;
        const failure = { message: 'Failed to fetch' };
        chain.in = () =>
          Promise.resolve(
            server.peopleError
              ? { data: null, error: server.peopleError }
              : server.online
                ? {
                    data: (server.dogs as { owner?: unknown }[]).map(d => d.owner).filter(Boolean),
                    error: null,
                  }
                : { data: null, error: failure }
          );
        chain.then = (resolve: (v: unknown) => unknown, reject: (r: unknown) => unknown) => {
          if (server.switchToDuringRead) server.userId = server.switchToDuringRead;
          if (server.signOutDuringRead) server.userId = null;
          return Promise.resolve(
            table === 'dogs' && server.online
              ? { data: server.dogs, error: null }
              : { data: null, error: failure }
          ).then(resolve, reject);
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
import { getOwnerAddressPrerequisite } from '@/components/shows/RegistrationWorkflow/ownerAddressPrerequisite';
import { clearOwnerNameCache } from '@/services/database/dogs/ownerNameCache';

const serverRow = (id: string, ownerId: string, first: string, last: string) => ({
  id,
  name: id,
  call_name: id,
  breed: 'Beagle',
  owner_id: ownerId,
  co_owner_id: null,
  deleted_at: null,
  registrations: [],
  owner: {
    id: ownerId,
    first_name: first,
    last_name: last,
    email: 'private@example.com',
    phone: '555-0100',
    street_address: '1 Main St',
    city: 'Town',
    state: 'TX',
    zip_code: '75001',
  },
});

const deviceDog = (id: string, ownerId: string | undefined): ReplicatedDog => ({
  id,
  name: id,
  callName: id,
  breed: 'Beagle',
  ...(ownerId ? { ownerId } : {}),
});

type Row = Record<string, unknown>;

describe('offline dogs list owners (MYK9-1189)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearOwnerNameCache();
    server.online = true;
    server.dogs = [];
    server.userId = 'user-1';
    server.switchToDuringRead = null;
    server.signOutDuringRead = false;
    server.peopleError = null;
    mockDogsTable.getAllDogsWithStatus.mockReset();
  });

  it('offline, a dog whose owner was shown online still shows that owner', async () => {
    server.dogs = [serverRow('dog-1', 'owner-1', 'Ada', 'Lovelace')];
    await getAllDogs('p', true);

    server.online = false;
    mockDogsTable.getAllDogsWithStatus.mockResolvedValue({
      rows: [deviceDog('dog-1', 'owner-1')],
      cold: false,
    });
    const { data, error } = await getAllDogs('p', true);

    expect(error).toBeNull();
    const row = (data as Row[])[0]!;
    // Display data only: no owner row is fabricated from the device copy.
    expect(row.owner).toBeNull();
    expect(row.owner_display_name).toBe('Ada Lovelace');
    expect(row.owner_unavailable_offline).toBeUndefined();
  });

  it('a recalled name never becomes an owner: the AKC address check stays "unknown, allowed"', async () => {
    server.dogs = [serverRow('dog-1', 'owner-1', 'Ada', 'Lovelace')];
    await getAllDogs('p', true);
    server.online = false;
    mockDogsTable.getAllDogsWithStatus.mockResolvedValue({
      rows: [deviceDog('dog-1', 'owner-1')],
      cold: false,
    });
    const { data } = await getAllDogs('p', true);

    const dog = mapDatabaseToDog((data as Row[])[0]!);
    expect(dog.owner).toBeUndefined();
    expect(dog.ownerName).toBe('Ada Lovelace');
    expect(
      getOwnerAddressPrerequisite({
        owner: dog.owner,
        registryId: 'AKC',
        isOwnAddress: false,
        warnOnly: false,
      })
    ).toEqual({ allowed: true, message: null });
  });

  it('keeps only the name on the device, no contact details', async () => {
    server.dogs = [serverRow('dog-1', 'owner-1', 'Ada', 'Lovelace')];
    await getAllDogs('p', true);

    const stored = window.localStorage.getItem('myk9.dogOwnerNames.v1:user-1') ?? '';
    expect(stored).toContain('Lovelace');
    expect(stored).not.toMatch(/private@example|555-0100|Main St/);
  });

  it('a read that lands after an account switch is dropped, not stored under either account', async () => {
    // MYK9-1202: the late response used to be written under the account that
    // started it (user-1). Writing only while that account is still signed in
    // drops it instead, so user-1's key holds nothing new and user-2 has none.
    server.dogs = [serverRow('dog-1', 'owner-1', 'Ada', 'Lovelace')];
    server.switchToDuringRead = 'user-2';
    await getAllDogs('p', true);

    expect(window.localStorage.getItem('myk9.dogOwnerNames.v1:user-2')).toBeNull();
    expect(window.localStorage.getItem('myk9.dogOwnerNames.v1:user-1')).toBeNull();
  });

  it('a read that lands after sign-out leaves no owner-name key on the device (MYK9-1202)', async () => {
    server.dogs = [serverRow('dog-1', 'owner-1', 'Ada', 'Lovelace')];
    server.signOutDuringRead = true;
    await getAllDogs('p', true);

    const keys = Array.from({ length: window.localStorage.length }, (_, i) =>
      window.localStorage.key(i)
    );
    const leftover = keys.filter(k => k?.startsWith('myk9.dogOwnerNames.v1:'));
    expect(leftover).toEqual([]);
  });

  it('offline, an owner the device never saw is marked unavailable, not blank', async () => {
    server.online = false;
    mockDogsTable.getAllDogsWithStatus.mockResolvedValue({
      rows: [deviceDog('dog-2', 'owner-9')],
      cold: false,
    });
    const { data } = await getAllDogs('p', true);

    const row = (data as Row[])[0]!;
    expect(row.owner).toBeNull();
    expect(row.owner_unavailable_offline).toBe(true);
    // The last hop to what the list renders.
    expect(mapDatabaseToDog(row).ownerUnavailableOffline).toBe(true);
  });

  it('an answered server error on the owners read is not offline: no cached names, no label', async () => {
    server.dogs = [serverRow('dog-1', 'owner-1', 'Ada', 'Lovelace')];
    await getAllDogs('p', true);

    server.online = false;
    server.peopleError = { message: 'permission denied for table people' };
    mockDogsTable.getAllDogsWithStatus.mockResolvedValue({
      rows: [deviceDog('dog-1', 'owner-1')],
      cold: false,
    });
    vi.stubGlobal('navigator', { ...navigator, onLine: true });
    try {
      const { data } = await getAllDogs('p', true);
      const row = (data as Row[])[0]!;
      expect(row.owner).toBeNull();
      expect(row.owner_unavailable_offline).toBeUndefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('a dog with no owner id is not flagged as unavailable', async () => {
    server.online = false;
    mockDogsTable.getAllDogsWithStatus.mockResolvedValue({
      rows: [deviceDog('dog-3', undefined)],
      cold: false,
    });
    const { data } = await getAllDogs('p', true);

    expect((data as Row[])[0]!.owner_unavailable_offline).toBeUndefined();
  });

  it('clearing the cache (sign-out) forgets the names', async () => {
    server.dogs = [serverRow('dog-1', 'owner-1', 'Ada', 'Lovelace')];
    await getAllDogs('p', true);
    clearOwnerNameCache();

    server.online = false;
    mockDogsTable.getAllDogsWithStatus.mockResolvedValue({
      rows: [deviceDog('dog-1', 'owner-1')],
      cold: false,
    });
    const { data } = await getAllDogs('p', true);
    expect((data as Row[])[0]!.owner_unavailable_offline).toBe(true);
  });
});
