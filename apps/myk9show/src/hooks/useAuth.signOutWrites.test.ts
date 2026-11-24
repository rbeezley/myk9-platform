/**
 * MYK9-2255: every directory write respects a sign-out, and one sign-out runs one
 * removal. Companion to useAuth.signOutPeople.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { databaseManager } from '@myk9/replication';
import type { User } from '@/types/user-types';

const auth = vi.hoisted(() => ({
  listener: undefined as ((event: string, session: unknown) => void) | undefined,
  getSession: vi.fn(),
}));
const directory = vi.hoisted(() => ({
  getAllUsers: vi.fn(),
  updateUser: vi.fn(),
  createUser: vi.fn(),
}));

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
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
    auth: { getSession: auth.getSession },
  },
}));
vi.mock('@/services/database/users', () => ({
  getAllUsers: directory.getAllUsers,
  updateUser: directory.updateUser,
  createUser: directory.createUser,
}));

import { useAuth } from '@/hooks/useAuth';
import { useUserStore } from '@/store/userStore';
import { currentSignOutGeneration, markDirectoryLoaded } from '@/store/userStoreContactRedaction';
import {
  peopleRedactionRunCount,
  peopleRedactionSettled,
  redactPeopleContactsOnStart,
  retryPendingPeopleRedaction,
} from '@/services/database/users/signOutPeopleRedaction';
import { replicatedShowDeskPeopleTable as desk } from '@/services/replication/ReplicatedShowDeskPeopleTable';

const STORAGE_KEY = 'myk9show-user-storage';
const MARKER = 'myk9show-people-redaction-pending';
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
const savedDirectory = (): User[] =>
  JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{"state":{"users":[]}}').state.users;
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

async function signOut(subscribers = 1) {
  const hooks = Array.from({ length: subscribers }, () => renderHook(() => useAuth()));
  for (const { result } of hooks) await waitFor(() => expect(result.current.loading).toBe(false));
  const runsBefore = peopleRedactionRunCount();
  act(() => auth.listener?.('SIGNED_OUT', null));
  await vi.waitFor(() => expect(peopleRedactionRunCount()).toBeGreaterThan(runsBefore));
  await peopleRedactionSettled();
}

const deskPerson = {
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
// The table's queue is set directly: a full MutationManager is not what is under test.
const setQueue = (queue: unknown) => {
  (desk as unknown as { mutationManager: unknown }).mutationManager = queue;
};
const coldInsert = { allowColdInsert: 'test fixture standing in for a desk add' } as const;

describe('every directory write respects a sign-out (MYK9-2255)', () => {
  beforeEach(async () => {
    localStorage.clear();
    vi.restoreAllMocks();
    directory.getAllUsers.mockReset();
    directory.updateUser.mockReset();
    directory.createUser.mockReset();
    auth.getSession.mockReset().mockResolvedValue({ data: { session: null } });
    setQueue(null);
    await databaseManager.reset();
    markDirectoryLoaded(currentSignOutGeneration());
    useUserStore.setState({ users: [person('p1', 'Ann')], people: [person('p1', 'Ann')] });
  });

  it('an updateUser in flight across a sign-out leaves no contact details in memory or storage', async () => {
    let finish: (value: unknown) => void = () => undefined;
    directory.updateUser.mockReturnValue(new Promise(resolve => (finish = resolve)));
    const updating = useUserStore.getState().updateUser('p1', { firstName: 'Anna' });
    await flush();

    await signOut();
    finish({ data: dbRow({ ...person('p1', 'Anna') }), error: null });
    await updating;
    await flush();

    expectNoContacts(useUserStore.getState().users);
    expectNoContacts(useUserStore.getState().people);
    expectNoContacts(savedDirectory());
    expect(useUserStore.getState().users[0]?.firstName).toBe('Anna');
  });

  it('an addUser finishing after a sign-out, and the legacy setters, keep no contact details', async () => {
    await signOut();
    directory.createUser.mockResolvedValue({ data: dbRow(person('p2', 'Cy')), error: null });
    await useUserStore.getState().addUser({ firstName: 'Cy', lastName: 'Smith' });
    useUserStore.getState().addUserLegacy(person('p3', 'Di'));
    useUserStore.getState().setPeople([...useUserStore.getState().users, person('p4', 'Ed')]);
    await flush();

    expect(useUserStore.getState().users.map(u => u.id)).toEqual(['p1', 'p2', 'p3', 'p4']);
    expectNoContacts(useUserStore.getState().users);
    expectNoContacts(useUserStore.getState().people);
    expectNoContacts(savedDirectory());
  });

  it('a show-desk row held back by isDirty keeps every field, a clean row is stripped (MYK9-2356)', async () => {
    await desk.set(
      'dirty-1',
      { id: 'dirty-1', ...deskPerson },
      true,
      undefined,
      undefined,
      coldInsert
    );
    await desk.set(
      'sent-1',
      { id: 'sent-1', ...deskPerson },
      false,
      undefined,
      undefined,
      coldInsert
    );

    await signOut();

    for (const id of ['dirty-1']) {
      expect(await desk.get(id)).toMatchObject({
        email: 'bo@example.com',
        phone: '555-0111',
        address: '2 Oak Ave',
        city: 'Waco',
        state: 'TX',
        zipCode: '76701',
      });
    }
    expect(await desk.get('sent-1')).toMatchObject({ email: null, phone: null, address: null });
  });

  it('a show-desk strip that fails at sign-out is not lost to a management load: the next start strips it', async () => {
    await desk.set(
      'sent-1',
      { id: 'sent-1', ...deskPerson },
      false,
      undefined,
      undefined,
      coldInsert
    );
    const strip = vi
      .spyOn(desk, 'redactSentContacts')
      .mockRejectedValueOnce(new Error('indexeddb unavailable'));

    await signOut();

    // The directory strip succeeded, so its marker is settled; the rows keep contacts.
    expect(localStorage.getItem(MARKER)).toBeNull();
    expectNoContacts(useUserStore.getState().users);
    expect(await desk.get('sent-1')).toMatchObject({ email: 'bo@example.com' });

    // A management load runs in between; it must not hide the failed row strip.
    directory.getAllUsers.mockResolvedValue({ data: [dbRow(person('p1', 'Ann'))], error: null });
    await useUserStore.getState().loadUsers();
    expect(await desk.get('sent-1')).toMatchObject({ email: 'bo@example.com' });

    await redactPeopleContactsOnStart();

    expect(strip).toHaveBeenCalledTimes(2);
    expect(await desk.get('sent-1')).toMatchObject({
      firstName: 'Bo',
      email: null,
      phone: null,
      address: null,
    });
  });

  it('a directory strip that fails keeps the marker, and the next start retries it while signed out', async () => {
    const storage = useUserStore.persist.getOptions().storage;
    const setItem = vi
      .spyOn(storage!, 'setItem')
      .mockRejectedValue(new Error('storage unavailable'));
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { users: [person('p1', 'Ann')] }, version: 1 })
    );

    await signOut();
    expect(localStorage.getItem(MARKER)).not.toBeNull();
    expect(savedDirectory()[0]?.email).toBe('Ann@example.com');

    setItem.mockRestore();
    await redactPeopleContactsOnStart();

    expect(localStorage.getItem(MARKER)).toBeNull();
    expectNoContacts(savedDirectory());
  });

  it('many useAuth subscribers share one removal per sign-out, and a clean run clears the marker', async () => {
    const redact = vi.spyOn(desk, 'redactSentContacts');

    await signOut(3);

    expect(redact).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(MARKER)).toBeNull();
  });

  it('a retry never strips while a session is signed in; the next load settles the marker', async () => {
    localStorage.setItem(MARKER, '1');
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    const redact = vi.spyOn(desk, 'redactSentContacts');
    useUserStore.setState({ users: [person('p1', 'Ann')], people: [person('p1', 'Ann')] });
    markDirectoryLoaded(currentSignOutGeneration());
    localStorage.removeItem(MARKER);
    localStorage.setItem(MARKER, '1');

    await retryPendingPeopleRedaction();
    expect(redact).not.toHaveBeenCalled();
    expect(localStorage.getItem(MARKER)).not.toBeNull();

    directory.getAllUsers.mockResolvedValue({ data: [dbRow(person('p1', 'Ann'))], error: null });
    await useUserStore.getState().loadUsers();

    expect(redact).not.toHaveBeenCalled();
    expect(localStorage.getItem(MARKER)).toBeNull();
    expect(useUserStore.getState().users[0]).toMatchObject({ email: 'Ann@example.com' });
  });
});
