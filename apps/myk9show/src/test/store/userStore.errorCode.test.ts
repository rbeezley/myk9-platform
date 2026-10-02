import { beforeEach, describe, expect, it, vi } from 'vitest';
import { friendlySaveError } from '@/utils/friendlySaveError';

const mocks = vi.hoisted(() => ({ createUser: vi.fn(), updateUser: vi.fn() }));
vi.mock('@/services/database/users', () => ({
  createUser: mocks.createUser,
  updateUser: mocks.updateUser,
}));
vi.mock('@/utils/standardizedErrorHandler', () => ({ reportStoreError: vi.fn() }));

import { useUserStore, type UserInput } from '@/store/userStore';

const GENERIC = {
  title: "Couldn't save your changes",
  description: 'Your changes are still here. Try again.',
};
const diagnostic = {
  code: 'PGRST204',
  message: "Could not find the 'nickname' column of 'people' in the schema cache",
};

/**
 * The store used to rethrow `new Error(dbError.message)`, which dropped the
 * SQLSTATE and let a PostgREST diagnostic read as authored text in the panel's
 * failure toast.
 */
describe('userStore keeps the database error code on failure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUserStore.setState({
      users: [{ id: 'p1', firstName: 'Pat', lastName: 'Doe' }] as never,
      people: [],
    });
  });

  it('addUser', async () => {
    mocks.createUser.mockResolvedValue({ data: null, error: diagnostic });
    const failure = await useUserStore
      .getState()
      .addUser({ firstName: 'Pat', lastName: 'Doe' } as UserInput)
      .catch((error: unknown) => error);
    expect((failure as { code?: string }).code).toBe('PGRST204');
    expect(friendlySaveError(failure)).toEqual(GENERIC);
  });

  it('updateUser', async () => {
    mocks.updateUser.mockResolvedValue({ data: null, error: diagnostic });
    const failure = await useUserStore
      .getState()
      .updateUser('p1', { firstName: 'Patty' })
      .catch((error: unknown) => error);
    expect((failure as { code?: string }).code).toBe('PGRST204');
    expect(friendlySaveError(failure)).toEqual(GENERIC);
  });
});
