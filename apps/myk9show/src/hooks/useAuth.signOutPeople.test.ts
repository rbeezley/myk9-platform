/**
 * MYK9-2255: after any sign-out no person saved on this device keeps a phone, an
 * email or an address; names stay. Checks every place people are saved: the
 * directory (myk9show-user-storage) and the device's own show-desk rows.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { databaseManager } from '@myk9/replication';
import type { User } from '@/types/user-types';

const auth = vi.hoisted(() => ({
  listener: undefined as ((event: string, session: unknown) => void) | undefined,
  getSession: vi.fn(),
}));
const directory = vi.hoisted(() => ({ getAllUsers: vi.fn() }));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: auth.getSession,
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        auth.listener = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
      signOut: vi.fn(),
    },
  },
  default: undefined,
}));
vi.mock('@/services/replication', () => ({
  replicatedClassesTable: { clearCachedHideCounts: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { rpc: vi.fn(), from: vi.fn(), auth: { getSession: auth.getSession } },
}));
vi.mock('@/services/database/users', () => ({ getAllUsers: directory.getAllUsers }));

import { useAuth } from '@/hooks/useAuth';
import { useUserStore } from '@/store/userStore';
import { replicatedShowDeskPeopleTable as desk } from '@/services/replication/ReplicatedShowDeskPeopleTable';

const STORAGE_KEY = 'myk9show-user-storage';
const person = (id: string, first: string): User => ({
  id,
  firstName: first,
  lastName: 'Smith',
  email: `${first}@example.com`,
  phone: '555-0100',
  address: '1 Main St',
  streetAddress: '1 Main St',
  city: 'Austin',
  state: 'TX',
  zipCode: '78701',
});
const dbRow = (u: User) => ({
  id: u.id,
  first_name: u.firstName,
  last_name: u.lastName,
  email: u.email,
  phone: u.phone,
  street_address: u.address,
  city: u.city,
  state: u.state,
  zip_code: u.zipCode,
});

function savedDirectory(): User[] {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{"state":{"users":[]}}').state.users;
}
function expectNoContacts(users: User[]) {
  expect(users.length).toBeGreaterThan(0);
  for (const u of users) {
    expect(u.email).toBeUndefined();
    expect(u.phone).toBeUndefined();
    expect(u.address).toBeUndefined();
    expect(u.streetAddress).toBeUndefined();
    expect(u.firstName).toBeTruthy();
  }
}
const flush = () => new Promise(resolve => setTimeout(resolve, 20));

async function signOut() {
  const { result } = renderHook(() => useAuth());
  await waitFor(() => expect(result.current.loading).toBe(false));
  act(() => auth.listener?.('SIGNED_OUT', null));
  await flush();
}

describe('sign-out removes contact details from every saved person (MYK9-2255)', () => {
  beforeEach(async () => {
    localStorage.clear();
    vi.restoreAllMocks();
    directory.getAllUsers.mockReset();
    auth.getSession.mockReset().mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    await databaseManager.reset();
    useUserStore.setState({ users: [person('p1', 'Ann')], people: [person('p1', 'Ann')] });
  });

  it('a SIGNED_OUT event strips the directory in memory and in storage, and a reload keeps it stripped', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { users: [person('p1', 'Ann')] }, version: 1 })
    );

    await signOut();

    expectNoContacts(useUserStore.getState().users);
    expectNoContacts(useUserStore.getState().people);
    expectNoContacts(savedDirectory());
    expect(useUserStore.getState().users[0]).toMatchObject({ firstName: 'Ann', lastName: 'Smith' });

    // A late rehydration from storage that still holds the old copy.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { users: [person('p1', 'Ann')] }, version: 1 })
    );
    await useUserStore.persist.rehydrate();
    expectNoContacts(useUserStore.getState().users);
    expectNoContacts(useUserStore.getState().people);
  });

  it('a directory load running at sign-out writes no contact details back', async () => {
    let finish: (value: unknown) => void = () => undefined;
    directory.getAllUsers.mockReturnValue(new Promise(resolve => (finish = resolve)));
    const loading = useUserStore.getState().loadUsers();
    await flush();

    await signOut();
    finish({ data: [dbRow(person('p1', 'Ann'))], error: null });
    await loading;

    expectNoContacts(useUserStore.getState().users);
    expectNoContacts(savedDirectory());
  });

  it('when saving the strip fails, sign-out still completes and the next load strips before reading', async () => {
    const storage = useUserStore.persist.getOptions().storage;
    const setItem = vi
      .spyOn(storage!, 'setItem')
      .mockRejectedValue(new Error('storage unavailable'));
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { users: [person('p1', 'Ann')] }, version: 1 })
    );

    await signOut();
    expect(localStorage.getItem('myk9show-people-redaction-pending')).not.toBeNull();
    expect(savedDirectory()[0]?.email).toBe('Ann@example.com');

    setItem.mockRestore();
    auth.getSession.mockResolvedValue({ data: { session: null } });
    directory.getAllUsers.mockImplementation(async () => {
      // The saved copy is already clean when the directory is read.
      expectNoContacts(savedDirectory());
      return { data: [], error: null };
    });
    await useUserStore.getState().loadUsers();

    expect(directory.getAllUsers).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('myk9show-people-redaction-pending')).toBeNull();
  });

  it('the next load after sign-out brings phone and email back without a button', async () => {
    await signOut();
    directory.getAllUsers.mockResolvedValue({ data: [dbRow(person('p1', 'Ann'))], error: null });

    await useUserStore.getState().loadUsers();

    expect(useUserStore.getState().users[0]).toMatchObject({
      email: 'Ann@example.com',
      phone: '555-0100',
    });
  });

  it('show-desk people rows: an unsent row keeps every field, a sent row keeps the name only', async () => {
    const base = {
      firstName: 'Bo',
      lastName: 'Lee',
      email: 'bo@example.com',
      phone: '555-0111',
      address: '2 Oak Ave',
      city: 'Waco',
      state: 'TX',
      zipCode: '76701',
      status: 'active',
    };
    const options = { allowColdInsert: 'test fixture standing in for a desk add' } as const;
    await desk.set('sent-1', { id: 'sent-1', ...base }, false, undefined, undefined, options);
    await desk.set(
      'unsent-1',
      { id: 'unsent-1', ...base, _localOnly: true, _syncStatus: 'pending' },
      true,
      undefined,
      undefined,
      options
    );

    await signOut();

    const sent = await desk.get('sent-1');
    expect(sent).toMatchObject({
      firstName: 'Bo',
      lastName: 'Lee',
      email: null,
      phone: null,
      address: null,
      city: null,
      zipCode: null,
    });
    const unsent = await desk.get('unsent-1');
    expect(unsent).toMatchObject({
      email: 'bo@example.com',
      phone: '555-0111',
      address: '2 Oak Ave',
    });
  });
});
