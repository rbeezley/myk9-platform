/**
 * MYK9-2255 (owner decision 3): sign-out takes phone, email and address off every
 * saved person and keeps the names, in every place people are saved on the device.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StateStorage } from 'zustand/middleware';
import { REPLICATION_STORES } from '@myk9/replication';
import type { User } from '@/types/user-types';

const storageState = vi.hoisted(() => ({
  data: new Map<string, string>(),
  failWrites: false,
}));
const getAllUsers = vi.hoisted(() => vi.fn());

vi.mock('@/services/database/storage-adapter', () => {
  const storage: StateStorage = {
    getItem: async name => storageState.data.get(name) ?? null,
    setItem: async (name, value) => {
      if (storageState.failWrites) throw new Error('storage unavailable');
      storageState.data.set(name, value);
    },
    removeItem: async name => {
      storageState.data.delete(name);
    },
  };
  return { getOptimalStorage: () => storage };
});
vi.mock('@/services/database/users', () => ({ getAllUsers }));
vi.mock('@/services/mappers/userMappers', () => ({
  mapDatabaseToUser: (row: User) => row,
}));

import { useUserStore } from '@/store/userStore';
import { replicatedShowDeskPeopleTable } from '@/services/replication/ReplicatedShowDeskPeopleTable';
import { purgePeopleContactOnSignOut, ensurePeopleContactPurged } from './signOutPeopleContact';
import { releasePeopleContactSeal } from './peopleContactSeal';
import { USER_STORE_STORAGE_NAME } from './peopleContactRedaction';

const FULL: User = {
  id: 'p1',
  firstName: 'Jamie',
  lastName: 'Walker',
  email: 'jamie@example.com',
  phone: '555-0100',
  address: '12 Ring Road',
  streetAddress: '12 Ring Road',
  city: 'Austin',
  state: 'TX',
  zipCode: '78701',
};

function persisted(users: User[]): string {
  return JSON.stringify({ state: { users }, version: 1 });
}

function contactOf(user: User | undefined) {
  return {
    email: user?.email,
    phone: user?.phone,
    address: user?.address,
    streetAddress: user?.streetAddress,
    city: user?.city,
    state: user?.state,
    zipCode: user?.zipCode,
  };
}

const NO_CONTACT = {
  email: undefined,
  phone: undefined,
  address: undefined,
  streetAddress: undefined,
  city: undefined,
  state: undefined,
  zipCode: undefined,
};

function savedUsers(): User[] {
  return JSON.parse(storageState.data.get(USER_STORE_STORAGE_NAME) ?? '{"state":{"users":[]}}')
    .state.users;
}

async function deskData(id: string) {
  const db = await (
    replicatedShowDeskPeopleTable as unknown as { init: () => Promise<IDBDatabase> }
  ).init();
  const idb = db as unknown as {
    get: (store: string, key: unknown[]) => Promise<{ data: Record<string, unknown> } | undefined>;
  };
  return (await idb.get(REPLICATION_STORES.REPLICATED_TABLES, ['people', id]))?.data;
}

beforeEach(async () => {
  localStorage.clear();
  storageState.data.clear();
  storageState.failWrites = false;
  getAllUsers.mockReset();
  releasePeopleContactSeal();
  await ensurePeopleContactPurged();
  useUserStore.setState({ users: [FULL], people: [FULL] });
  storageState.data.set(USER_STORE_STORAGE_NAME, persisted([FULL]));
});

afterEach(() => {
  releasePeopleContactSeal();
});

describe('sign-out strips the saved people directory', () => {
  it('removes contact details from the store and the saved copy, and keeps names', async () => {
    await purgePeopleContactOnSignOut();

    const live = useUserStore.getState().users[0];
    expect(contactOf(live)).toEqual(NO_CONTACT);
    expect(live).toMatchObject({ id: 'p1', firstName: 'Jamie', lastName: 'Walker' });
    expect(useUserStore.getState().people[0]).toMatchObject({ firstName: 'Jamie' });
    expect(contactOf(savedUsers()[0])).toEqual(NO_CONTACT);
    expect(savedUsers()[0]).toMatchObject({ firstName: 'Jamie', lastName: 'Walker' });
  });

  it('stays stripped when the saved copy rehydrates late', async () => {
    await purgePeopleContactOnSignOut();
    storageState.data.set(USER_STORE_STORAGE_NAME, persisted([FULL]));

    await useUserStore.persist.rehydrate();

    expect(contactOf(useUserStore.getState().users[0])).toEqual(NO_CONTACT);
    expect(contactOf(useUserStore.getState().people[0])).toEqual(NO_CONTACT);
    expect(useUserStore.getState().users[0]?.firstName).toBe('Jamie');
  });

  it('writes nothing back from a directory load that was running at sign-out', async () => {
    let resolveLoad: (value: unknown) => void = () => {};
    getAllUsers.mockReturnValue(new Promise(resolve => (resolveLoad = resolve)));
    const load = useUserStore.getState().loadUsers();
    await vi.waitFor(() => expect(getAllUsers).toHaveBeenCalled());

    await purgePeopleContactOnSignOut();
    resolveLoad({ data: [FULL], error: null });
    await load;

    expect(contactOf(useUserStore.getState().users[0])).toEqual(NO_CONTACT);
    expect(useUserStore.getState().isLoading).toBe(false);
  });

  it('completes when storage is unavailable, and runs again before the next directory read', async () => {
    storageState.failWrites = true;
    await expect(purgePeopleContactOnSignOut()).resolves.toBeUndefined();
    expect(contactOf(savedUsers()[0]).phone).toBe('555-0100');

    // Next load: storage is back; the removal runs before the directory is read.
    storageState.failWrites = false;
    releasePeopleContactSeal();
    getAllUsers.mockImplementation(async () => {
      expect(contactOf(savedUsers()[0])).toEqual(NO_CONTACT);
      return { data: [FULL], error: null };
    });
    await useUserStore.getState().loadUsers();

    expect(getAllUsers).toHaveBeenCalledTimes(1);
  });

  it('keeps a failed removal pending across a reload (marker in storage)', async () => {
    storageState.failWrites = true;
    await purgePeopleContactOnSignOut();
    expect(localStorage.getItem('myk9.peopleContactPurgePending.v1')).toBe('1');

    storageState.failWrites = false;
    await ensurePeopleContactPurged();
    expect(localStorage.getItem('myk9.peopleContactPurgePending.v1')).toBeNull();
    expect(contactOf(savedUsers()[0])).toEqual(NO_CONTACT);
  });

  it('brings phone and email back on the next load after signing in', async () => {
    await purgePeopleContactOnSignOut();
    releasePeopleContactSeal();
    getAllUsers.mockResolvedValue({ data: [FULL], error: null });

    await useUserStore.getState().loadUsers();

    expect(useUserStore.getState().users[0]).toMatchObject({
      email: 'jamie@example.com',
      phone: '555-0100',
    });
  });
});

describe('sign-out and the people saved by the show desk', () => {
  async function seedDeskRows() {
    const person = (id: string) => ({
      id,
      firstName: id,
      lastName: 'Handler',
      email: `${id}@example.com`,
      phone: '555-0101',
      address: '1 Main St',
      city: 'Austin',
      state: 'TX',
      zipCode: '78701',
      status: 'active',
    });
    await replicatedShowDeskPeopleTable.batchSet([person('sent')]);
    await replicatedShowDeskPeopleTable.set(
      'unsent',
      { ...person('unsent'), _localOnly: true },
      true
    );
  }

  it('keeps an unsent person whole and reduces a sent one to the name, after sign-out and reload', async () => {
    await seedDeskRows();

    await purgePeopleContactOnSignOut();
    // A reload re-runs the removal on the next load; it changes nothing more.
    await ensurePeopleContactPurged();
    await useUserStore.persist.rehydrate();

    const sent = await deskData('sent');
    expect(sent).toMatchObject({ firstName: 'sent', lastName: 'Handler' });
    expect(sent).toMatchObject({
      email: null,
      phone: null,
      address: null,
      city: null,
      state: null,
      zipCode: null,
    });
    expect(await deskData('unsent')).toMatchObject({
      email: 'unsent@example.com',
      phone: '555-0101',
      address: '1 Main St',
    });
    expect(contactOf(useUserStore.getState().users[0])).toEqual(NO_CONTACT);
    expect(contactOf(savedUsers()[0])).toEqual(NO_CONTACT);
  });
});
