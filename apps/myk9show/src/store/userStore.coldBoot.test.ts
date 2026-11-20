/**
 * MYK9-2255: a pending sign-out marker with no sign-out on this page (a cold boot)
 * strips the saved directory on rehydrate. Its own file: it needs a pristine
 * module registry, and sharing one with the sign-out tests made their order matter.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@/types/user-types';

vi.mock('@/services/database/users', () => ({
  getAllUsers: vi.fn(),
  updateUser: vi.fn(),
  createUser: vi.fn(),
}));

const STORAGE_KEY = 'myk9show-user-storage';
const MARKER = 'myk9show-people-redaction-pending';
const person: User = {
  id: 'p1',
  firstName: 'Ann',
  lastName: 'Smith',
  email: 'Ann@example.com',
  phone: '555-0100',
  address: '1 Main St',
  streetAddress: '1 Main St',
  city: 'Austin',
  state: 'TX',
  zipCode: '78701',
};

describe('cold boot with a pending removal marker (MYK9-2255)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('strips the saved copy on rehydrate', async () => {
    localStorage.setItem(MARKER, '1');
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { users: [person] }, version: 1 }));
    const { useUserStore } = await import('@/store/userStore');
    const redaction = await import('@/store/userStoreContactRedaction');
    expect(redaction.currentSignOutGeneration()).toBe(0);

    await useUserStore.persist.rehydrate();

    for (const list of [useUserStore.getState().users, useUserStore.getState().people]) {
      expect(list.length).toBeGreaterThan(0);
      for (const u of list) {
        expect(u.email).toBeUndefined();
        expect(u.phone).toBeUndefined();
        expect(u.address).toBeUndefined();
        expect(u.streetAddress).toBeUndefined();
        expect(u.firstName).toBe('Ann');
      }
    }
  });

  it('keeps names when sign-out lands before hydration finishes', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { users: [person] }, version: 1 }));
    const { useUserStore } = await import('@/store/userStore');
    vi.spyOn(useUserStore.persist, 'hasHydrated').mockReturnValue(false);
    useUserStore.setState({ users: [], people: [] });
    // setState persists the empty list; put the saved copy back, as a cold boot finds it.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { users: [person] }, version: 1 }));

    expect(await useUserStore.getState().redactContacts()).toBe(true);

    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').state.users;
    expect(saved).toHaveLength(1);
    expect(saved[0].firstName).toBe('Ann');
    expect(saved[0].email).toBeUndefined();
    expect(saved[0].phone).toBeUndefined();
    expect(useUserStore.getState().users[0].firstName).toBe('Ann');
  });

  it('writes nothing before hydration when the saved copy cannot be read', async () => {
    const { useUserStore } = await import('@/store/userStore');
    vi.spyOn(useUserStore.persist, 'hasHydrated').mockReturnValue(false);
    useUserStore.setState({ users: [], people: [] });
    // The storage adapter turns a failed read into null; the saved copy is still there.
    vi.spyOn(useUserStore.persist.getOptions().storage!, 'getItem').mockResolvedValue(null);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { users: [person] }, version: 1 }));

    expect(await useUserStore.getState().redactContacts()).toBe(false);

    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').state.users;
    expect(saved).toHaveLength(1);
    expect(saved[0].firstName).toBe('Ann');
  });
});
