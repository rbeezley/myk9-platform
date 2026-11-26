/**
 * MYK9-2253: a refresh that comes back short of the server's count, or fails,
 * keeps the copy already saved and marks the directory incomplete. The mark is
 * saved with the copy, and a full load clears it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@/types/user-types';

const directory = vi.hoisted(() => ({ getAllUsers: vi.fn() }));
vi.mock('@/services/database/users', () => ({
  getAllUsers: directory.getAllUsers,
  updateUser: vi.fn(),
  createUser: vi.fn(),
}));

import { useUserStore } from '@/store/userStore';
import { bumpSignOutGeneration } from '@/store/userStoreContactRedaction';

const STORAGE_KEY = 'myk9show-user-storage';
const saved: User = { id: 'saved-1', firstName: 'Ann', lastName: 'Smith' };
const row = (id: string, first: string) => ({
  id,
  first_name: first,
  last_name: 'Jones',
  roles: [],
});
const savedState = () => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').state;
const short = { tableName: 'people_directory', serverCount: 3, deviceCount: 2 };

describe('userStore.directoryIncomplete (MYK9-2253)', () => {
  beforeEach(() => {
    localStorage.clear();
    directory.getAllUsers.mockReset();
    useUserStore.setState({
      users: [saved],
      people: [saved],
      directoryIncomplete: false,
      isLoading: false,
      error: null,
    });
  });

  it('a short load keeps the saved copy and marks it incomplete, saved with the copy', async () => {
    directory.getAllUsers.mockResolvedValue({
      data: [row('a', 'Al'), row('b', 'Bo')],
      error: null,
      short,
    });

    await useUserStore.getState().loadUsers();

    const state = useUserStore.getState();
    expect(state.users).toEqual([saved]);
    expect(state.people).toEqual([saved]);
    expect(state.directoryIncomplete).toBe(true);
    expect(savedState().directoryIncomplete).toBe(true);
    expect(savedState().users).toEqual([saved]);
  });

  it('a short load on a device with no saved copy keeps what arrived, still marked incomplete', async () => {
    useUserStore.setState({ users: [], people: [] });
    directory.getAllUsers.mockResolvedValue({
      data: [row('a', 'Al'), row('b', 'Bo')],
      error: null,
      short,
    });

    await useUserStore.getState().loadUsers();

    const state = useUserStore.getState();
    expect(state.users.map(user => user.id)).toEqual(['a', 'b']);
    expect(state.directoryIncomplete).toBe(true);
    expect(savedState().directoryIncomplete).toBe(true);
  });

  it('a failed load keeps the saved copy and marks it incomplete', async () => {
    directory.getAllUsers.mockResolvedValue({
      data: [],
      error: { message: 'offline', code: 'X' },
      short: null,
    });

    await useUserStore.getState().loadUsers();

    expect(useUserStore.getState().users).toEqual([saved]);
    expect(useUserStore.getState().directoryIncomplete).toBe(true);
    expect(savedState().directoryIncomplete).toBe(true);
  });

  it('a full load replaces the copy and clears the mark', async () => {
    useUserStore.setState({ directoryIncomplete: true });
    directory.getAllUsers.mockResolvedValue({
      data: [row('a', 'Al'), row('b', 'Bo')],
      error: null,
      short: null,
    });

    await useUserStore.getState().loadUsers();

    const state = useUserStore.getState();
    expect(state.users.map(user => user.id)).toEqual(['a', 'b']);
    expect(state.directoryIncomplete).toBe(false);
    expect(savedState().directoryIncomplete).toBe(false);
  });

  it('the mark is still known after a reload', async () => {
    useUserStore.setState({ directoryIncomplete: true });
    useUserStore.setState({ directoryIncomplete: false, users: [], people: [] });
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { users: [saved], directoryIncomplete: true }, version: 1 })
    );

    await useUserStore.persist.rehydrate();

    expect(useUserStore.getState().directoryIncomplete).toBe(true);
    expect(useUserStore.getState().users).toEqual([saved]);
  });

  it.each([
    ['full', { data: [row('a', 'Al')], error: null, short: null }],
    ['short', { data: [row('a', 'Al')], error: null, short }],
    ['failed', { data: [], error: { message: 'offline', code: 'X' }, short: null }],
  ])('a %s load still running at sign-out writes nothing back', async (_kind, answer) => {
    let finish: (value: unknown) => void = () => undefined;
    directory.getAllUsers.mockReturnValue(new Promise(resolve => (finish = resolve)));

    const pending = useUserStore.getState().loadUsers();
    await vi.waitFor(() => expect(directory.getAllUsers).toHaveBeenCalled());
    bumpSignOutGeneration();
    finish(answer);
    await pending;

    const state = useUserStore.getState();
    expect(state.users).toEqual([saved]);
    expect(state.directoryIncomplete).toBe(false);
    expect(state.isLoading).toBe(false);
  });
});
