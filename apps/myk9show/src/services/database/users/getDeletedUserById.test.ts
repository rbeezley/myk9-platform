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

const rolesQuery = (result: { data?: unknown[]; error?: unknown }) => {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  // The single .eq(user_id) resolves. There is deliberately no is_active filter
  // — see the note in getDeletedUserById.
  chain.eq = vi.fn(() =>
    Promise.resolve({ data: result.data ?? null, error: result.error ?? null })
  );
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
    from.mockReturnValue(rolesQuery({ data: [{ role: { name: 'judge' } }] }));

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
    from.mockReturnValue(rolesQuery({ data: [] }));

    const { data } = await getDeletedUserById('gone-1');

    expect(data).toMatchObject({ id: 'gone-1', user_roles: [] });
  });

  it('asks for roles WITHOUT an is_active filter', async () => {
    // soft_delete_person deactivates every role on the way out and
    // restore_person does not put them back, so filtering on is_active would
    // return nothing for exactly the people this function reads. The record
    // would render role-less and look correct.
    rpc.mockResolvedValue({ data: [{ id: 'gone-1' }], error: null });
    const chain = rolesQuery({ data: [{ role: { name: 'judge' } }] });
    from.mockReturnValue(chain);

    const { data } = await getDeletedUserById('gone-1');

    const eq = chain.eq as ReturnType<typeof vi.fn>;
    expect(eq).toHaveBeenCalledTimes(1);
    expect(eq).toHaveBeenCalledWith('user_id', 'gone-1');
    expect(data).toMatchObject({ user_roles: [{ role: { name: 'judge' } }] });
  });

  it('drops a grant that expired before the removal', async () => {
    // Legacy user_roles rows have no deactivation timestamp, so a grant revoked
    // without an expiry is indistinguishable and is kept.
    rpc.mockResolvedValue({
      data: [{ id: 'gone-1', deleted_at: '2026-07-30T00:00:00Z' }],
      error: null,
    });
    from.mockReturnValue(
      rolesQuery({
        data: [
          { expires_at: '2026-01-01T00:00:00Z', role: { name: 'steward' } },
          { expires_at: '2027-01-01T00:00:00Z', role: { name: 'judge' } },
          { expires_at: null, role: { name: 'exhibitor' } },
        ],
      })
    );

    const { data } = await getDeletedUserById('gone-1');

    const names = (data as { user_roles: { role: { name: string } }[] }).user_roles.map(
      r => r.role.name
    );
    expect(names).toEqual(['judge', 'exhibitor']);
  });

  it('keeps only grants deactivated by this removal plus active grants', async () => {
    rpc.mockResolvedValue({
      data: [{ id: 'gone-1', deleted_at: '2026-07-30T00:00:00Z' }],
      error: null,
    });
    from.mockReturnValue(
      rolesQuery({
        data: [
          {
            is_active: false,
            deactivated_at: '2026-07-30T00:00:00Z',
            role: { name: 'judge' },
          },
          {
            is_active: false,
            deactivated_at: '2026-07-01T00:00:00Z',
            role: { name: 'steward' },
          },
          { is_active: true, deactivated_at: null, role: { name: 'admin' } },
        ],
      })
    );

    const { data } = await getDeletedUserById('gone-1');

    const names = (data as { user_roles: { role: { name: string } }[] }).user_roles.map(
      r => r.role.name
    );
    expect(names).toEqual(['judge', 'admin']);
  });

  it('keeps every grant when the removal has no timestamp', async () => {
    rpc.mockResolvedValue({ data: [{ id: 'gone-1' }], error: null });
    from.mockReturnValue(
      rolesQuery({ data: [{ expires_at: '2020-01-01T00:00:00Z', role: { name: 'judge' } }] })
    );

    const { data } = await getDeletedUserById('gone-1');

    expect((data as { user_roles: unknown[] }).user_roles).toHaveLength(1);
  });

  it('fails the read when the roles query fails', async () => {
    // A record that renders with no roles because the roles query broke is the
    // same silent lie as not asking for them.
    rpc.mockResolvedValue({ data: [{ id: 'gone-1' }], error: null });
    from.mockReturnValue(rolesQuery({ error: new Error('permission denied') }));

    const { data, error } = await getDeletedUserById('gone-1');

    expect(data).toBeNull();
    expect(error).toBeTruthy();
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
