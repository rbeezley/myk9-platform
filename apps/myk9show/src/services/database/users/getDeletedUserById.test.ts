/**
 * MYK9-153: the removed-person read must return a COMPLETE record.
 *
 * `get_deleted_people()` returns `SETOF public.people` — the row and nothing
 * else — while `getUserById` embeds user_roles. Mapping the bare row yields an
 * empty role list, which reads as "this person had no roles" rather than "we
 * didn't ask": a removed judge would silently lose their badge and their
 * judge-only sections. That failure is invisible without this test.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
const from = vi.fn();

vi.mock('../supabaseClient', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    from: (...args: unknown[]) => from(...args),
  },
  logQuery: vi.fn(),
  createDatabaseError: (error: unknown) => error,
}));

vi.mock('@/services/LoggingService', () => ({ logger: { error: vi.fn(), debug: vi.fn() } }));
vi.mock('@/utils/duplicateIdentityErrors', () => ({
  translatePersonIdentityError: (e: unknown) => e,
}));

import { getDeletedUserById } from './reads';

const rolesQuery = (rows: unknown[]) => {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    then: undefined as unknown,
  };
  // Final .eq() resolves to the roles payload.
  chain.eq = vi
    .fn()
    .mockImplementationOnce(() => chain)
    .mockImplementationOnce(() => Promise.resolve({ data: rows, error: null }));
  return chain;
};

describe('getDeletedUserById', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when the id is not among the removed people', async () => {
    rpc.mockResolvedValue({ data: [{ id: 'someone-else' }], error: null });

    const { data } = await getDeletedUserById('gone-1');

    expect(data).toBeNull();
    // No point asking for the roles of a person we did not find.
    expect(from).not.toHaveBeenCalled();
  });

  it('attaches the roles the RPC does not return', async () => {
    rpc.mockResolvedValue({ data: [{ id: 'gone-1', first_name: 'Ada' }], error: null });
    from.mockReturnValue(rolesQuery([{ role: { name: 'judge' } }]));

    const { data } = await getDeletedUserById('gone-1');

    expect(from).toHaveBeenCalledWith('user_roles');
    // The shape extractRoles expects — not a flat array, not a bare name.
    expect(data).toMatchObject({
      id: 'gone-1',
      user_roles: [{ role: { name: 'judge' } }],
    });
  });

  it('still returns the person when they genuinely hold no roles', async () => {
    rpc.mockResolvedValue({ data: [{ id: 'gone-1' }], error: null });
    from.mockReturnValue(rolesQuery([]));

    const { data } = await getDeletedUserById('gone-1');

    expect(data).toMatchObject({ id: 'gone-1', user_roles: [] });
  });

  it('surfaces an RPC failure instead of reporting "not found"', async () => {
    // A refused or failed read must not look like a person who isn't there —
    // the page renders an error and a retry off the back of this.
    rpc.mockResolvedValue({ data: null, error: new Error('permission denied') });

    const { data, error } = await getDeletedUserById('gone-1');

    expect(data).toBeNull();
    expect(error).toBeTruthy();
  });
});
