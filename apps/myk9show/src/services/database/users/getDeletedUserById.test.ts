import { createDatabaseError } from '@/services/database/databaseError';
/**
 * MYK9-153: the removed-person read must return a COMPLETE record.
 *
 * `get_deleted_people()` returns `SETOF public.people` — the row and nothing
 * else — while live reads hydrate role labels separately. Mapping the bare row yields an
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
  createDatabaseError,
}));

vi.mock('@/services/LoggingService', () => ({ logger: { error: vi.fn(), debug: vi.fn() } }));
vi.mock('@/utils/duplicateIdentityErrors', () => ({
  translatePersonIdentityError: (e: unknown) => e,
}));

import { getDeletedUserById } from './reads';

const mockDeletedRead = (
  people: unknown[],
  roles: { data?: unknown[]; error?: unknown } = { data: [] }
) => {
  rpc.mockImplementation((name: string) => {
    if (name === 'get_deleted_people') return Promise.resolve({ data: people, error: null });
    if (name === 'get_deleted_person_role_history') {
      return Promise.resolve({ data: roles.data ?? null, error: roles.error ?? null });
    }
    throw new Error(`Unexpected RPC: ${name}`);
  });
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
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('attaches the roles the RPC does not return', async () => {
    mockDeletedRead([{ id: 'gone-1', first_name: 'Ada' }], {
      data: [{ role_name: 'judge' }],
    });

    const { data } = await getDeletedUserById('gone-1');

    expect(rpc).toHaveBeenCalledWith('get_deleted_person_role_history', {
      p_person_id: 'gone-1',
    });
    // The shape extractRoles expects — not a flat array, not a bare name.
    expect(data).toMatchObject({
      id: 'gone-1',
      user_roles: [{ role: { name: 'judge' } }],
    });
  });

  it('still returns the person when they genuinely hold no roles', async () => {
    mockDeletedRead([{ id: 'gone-1' }]);

    const { data } = await getDeletedUserById('gone-1');

    expect(data).toMatchObject({ id: 'gone-1', user_roles: [] });
  });

  it('asks the history RPC for roles without applying a client-side active filter', async () => {
    // soft_delete_person deactivates every role on the way out and
    // restore_person does not put them back, so filtering on is_active would
    // return nothing for exactly the people this function reads. The record
    // would render role-less and look correct.
    mockDeletedRead([{ id: 'gone-1' }], { data: [{ role_name: 'judge' }] });

    const { data } = await getDeletedUserById('gone-1');

    expect(from).not.toHaveBeenCalled();
    expect(data).toMatchObject({ user_roles: [{ role: { name: 'judge' } }] });
  });

  it('drops a grant that expired before the removal', async () => {
    // Legacy user_roles rows have no deactivation timestamp, so a grant revoked
    // without an expiry is indistinguishable and is kept.
    mockDeletedRead([{ id: 'gone-1', deleted_at: '2026-07-30T00:00:00Z' }], {
      data: [
        { expires_at: '2026-01-01T00:00:00Z', role_name: 'steward' },
        { expires_at: '2027-01-01T00:00:00Z', role_name: 'judge' },
        { expires_at: null, role_name: 'exhibitor' },
      ],
    });

    const { data } = await getDeletedUserById('gone-1');

    const names = (data as { user_roles: { role: { name: string } }[] }).user_roles.map(
      r => r.role.name
    );
    expect(names).toEqual(['judge', 'exhibitor']);
  });

  it('keeps only grants deactivated by this removal plus active grants', async () => {
    mockDeletedRead([{ id: 'gone-1', deleted_at: '2026-07-30T00:00:00Z' }], {
      data: [
        {
          is_active: false,
          deactivated_at: '2026-07-30T00:00:00Z',
          role_name: 'judge',
        },
        {
          is_active: false,
          deactivated_at: '2026-07-01T00:00:00Z',
          role_name: 'steward',
        },
        { is_active: true, deactivated_at: null, role_name: 'admin' },
      ],
    });

    const { data } = await getDeletedUserById('gone-1');

    const names = (data as { user_roles: { role: { name: string } }[] }).user_roles.map(
      r => r.role.name
    );
    expect(names).toEqual(['judge', 'admin']);
  });

  it('keeps every grant when the removal has no timestamp', async () => {
    mockDeletedRead([{ id: 'gone-1' }], {
      data: [{ expires_at: '2020-01-01T00:00:00Z', role_name: 'judge' }],
    });

    const { data } = await getDeletedUserById('gone-1');

    expect((data as { user_roles: unknown[] }).user_roles).toHaveLength(1);
  });

  it('fails the read when the roles query fails', async () => {
    // A record that renders with no roles because the roles query broke is the
    // same silent lie as not asking for them.
    mockDeletedRead([{ id: 'gone-1' }], { error: new Error('permission denied') });

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
