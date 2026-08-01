import { describe, expect, it, vi } from 'vitest';

import { HttpError } from '../_shared/http/responses.ts';
import { deleteUserHandler } from './deleteUserHandler.ts';

/** Minimal thenable query-builder chain, like the send-email authz tests use. */
function chain<T>(data: T, error: unknown = null) {
  const query: Record<string, unknown> = {};
  const self = () => query as unknown;
  query.select = vi.fn(self);
  query.eq = vi.fn(self);
  query.is = vi.fn(self);
  query.or = vi.fn(self);
  query.delete = vi.fn(self);
  query.single = vi.fn(async () => ({ data, error }));
  query.then = ((resolve: (value: { data: T; error: unknown }) => unknown) =>
    Promise.resolve({ data, error }).then(resolve)) as never;
  return query;
}

interface MockOptions {
  callerPerson?: { id: string } | null;
  callerError?: unknown;
  rbacRoles?: Array<{ role: { name: string } | null }> | null;
  rbacError?: unknown;
  targetPerson?: {
    id: string;
    first_name: string;
    last_name: string;
    auth_user_id: string | null;
  } | null;
  targetError?: unknown;
  deleteError?: { code?: string; message: string } | null;
  authDeleteError?: unknown;
}

function makeSupabase(opts: MockOptions = {}) {
  const deleteUser = vi.fn(async () => ({ error: opts.authDeleteError ?? null }));
  const deleteEq = vi.fn(async () => ({ error: opts.deleteError ?? null }));

  const callerChain = chain(
    opts.callerPerson === undefined ? { id: 'caller-1' } : opts.callerPerson,
    opts.callerError ?? null
  );
  const targetChain = chain(
    opts.targetPerson === undefined
      ? { id: 'target-1', first_name: 'Jane', last_name: 'Doe', auth_user_id: 'auth-1' }
      : opts.targetPerson,
    opts.targetError ?? null
  );

  // handleDeleteUser calls `supabase.from('people')` three times in a fixed
  // order: caller lookup, target lookup, delete. Count invocations of
  // `from('people')` itself (not `.select()`) so each call routes to the
  // right terminal regardless of how many chained methods it calls.
  let peopleFromCalls = 0;

  const from = vi.fn((table: string) => {
    if (table === 'people') {
      peopleFromCalls += 1;
      if (peopleFromCalls === 1) return { select: vi.fn(() => callerChain) };
      if (peopleFromCalls === 2) return { select: vi.fn(() => targetChain) };
      return { delete: vi.fn(() => ({ eq: deleteEq })) };
    }
    if (table === 'user_roles') {
      return chain(
        opts.rbacRoles === undefined ? [{ role: { name: 'site_admin' } }] : opts.rbacRoles,
        opts.rbacError ?? null
      );
    }
    throw new Error(`unexpected table ${table}`);
  });

  const supabase = {
    from,
    auth: {
      admin: {
        deleteUser,
      },
    },
  };

  return { supabase, deleteUser, deleteEq };
}

describe('deleteUserHandler', () => {
  it('rejects an unauthenticated caller (no user on ctx) with 401', async () => {
    const { supabase } = makeSupabase();

    await expect(
      deleteUserHandler({
        body: { personId: 'target-1' },
        user: undefined,
        supabase: supabase as never,
      } as never)
    ).rejects.toMatchObject({ status: 401 });
  });

  it('rejects when the caller has no people row with 403', async () => {
    const { supabase } = makeSupabase({ callerPerson: null });

    await expect(
      deleteUserHandler({
        body: { personId: 'target-1' },
        user: { id: 'auth-caller' },
        supabase: supabase as never,
      } as never)
    ).rejects.toMatchObject({ status: 403, message: 'Caller not found' });
  });

  it('rejects a non-site_admin caller with 403', async () => {
    const { supabase } = makeSupabase({ rbacRoles: [{ role: { name: 'secretary' } }] });

    await expect(
      deleteUserHandler({
        body: { personId: 'target-1' },
        user: { id: 'auth-caller' },
        supabase: supabase as never,
      } as never)
    ).rejects.toThrow('Unauthorized: requires site_admin role');
  });

  it('fails closed when the role lookup errors', async () => {
    const { supabase, deleteEq, deleteUser } = makeSupabase({ rbacError: { message: 'timeout' } });

    await expect(
      deleteUserHandler({
        body: { personId: 'target-1' },
        user: { id: 'auth-caller' },
        supabase: supabase as never,
      } as never)
    ).rejects.toMatchObject({ status: 500, message: 'Failed to verify caller role' });
    expect(deleteEq).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('rejects a missing personId with 400', async () => {
    const { supabase } = makeSupabase();

    await expect(
      deleteUserHandler({
        body: {} as never,
        user: { id: 'auth-caller' },
        supabase: supabase as never,
      } as never)
    ).rejects.toMatchObject({ status: 400, message: 'Missing required parameter: personId' });
  });

  it('blocks a site_admin from deleting their own account', async () => {
    const { supabase } = makeSupabase({ callerPerson: { id: 'self-1' } });

    await expect(
      deleteUserHandler({
        body: { personId: 'self-1' },
        user: { id: 'auth-caller' },
        supabase: supabase as never,
      } as never)
    ).rejects.toMatchObject({ status: 400, message: 'Cannot delete your own account' });
  });

  it('returns 404 when the target person does not exist', async () => {
    const { supabase } = makeSupabase({ targetPerson: null });

    await expect(
      deleteUserHandler({
        body: { personId: 'missing-1' },
        user: { id: 'auth-caller' },
        supabase: supabase as never,
      } as never)
    ).rejects.toMatchObject({ status: 404, message: 'User not found' });
  });

  it('surfaces the owns-dogs guard trigger as a 409 with the MK001 code', async () => {
    const { supabase } = makeSupabase({
      deleteError: { code: 'MK001', message: 'Person owns live dogs' },
    });

    await expect(
      deleteUserHandler({
        body: { personId: 'target-1' },
        user: { id: 'auth-caller' },
        supabase: supabase as never,
      } as never)
    ).rejects.toMatchObject({ status: 409, message: 'Person owns live dogs', code: 'MK001' });
  });

  it('maps any other delete failure to a generic 500', async () => {
    const { supabase } = makeSupabase({ deleteError: { message: 'constraint violation' } });

    await expect(
      deleteUserHandler({
        body: { personId: 'target-1' },
        user: { id: 'auth-caller' },
        supabase: supabase as never,
      } as never)
    ).rejects.toMatchObject({ status: 500, message: 'Failed to delete user record' });
  });

  it('happy path: deletes the people row and the auth user, and reports success', async () => {
    const { supabase, deleteUser, deleteEq } = makeSupabase();

    const result = await deleteUserHandler({
      body: { personId: 'target-1' },
      user: { id: 'auth-caller' },
      supabase: supabase as never,
    } as never);

    expect(deleteEq).toHaveBeenCalledWith('id', 'target-1');
    expect(deleteUser).toHaveBeenCalledWith('auth-1');
    expect(result).toEqual({
      success: true,
      deleted: { personId: 'target-1', authUserDeleted: true },
    });
  });

  it('happy path: still succeeds (deleted.authUserDeleted: false) when the target has no auth_user_id', async () => {
    const { supabase, deleteUser } = makeSupabase({
      targetPerson: { id: 'target-1', first_name: 'Jane', last_name: 'Doe', auth_user_id: null },
    });

    const result = await deleteUserHandler({
      body: { personId: 'target-1' },
      user: { id: 'auth-caller' },
      supabase: supabase as never,
    } as never);

    expect(deleteUser).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: true,
      deleted: { personId: 'target-1', authUserDeleted: false },
    });
  });

  it('does not fail the request when the people row deleted but the auth.admin.deleteUser call errors', async () => {
    const { supabase } = makeSupabase({ authDeleteError: { message: 'auth service down' } });

    const result = await deleteUserHandler({
      body: { personId: 'target-1' },
      user: { id: 'auth-caller' },
      supabase: supabase as never,
    } as never);

    expect(result).toMatchObject({ success: true });
  });
});

describe('deleteUserHandler error shape', () => {
  it('throws HttpError instances (verifying the import is exercised, not just duck-typed)', async () => {
    const { supabase } = makeSupabase({ callerPerson: null });

    try {
      await deleteUserHandler({
        body: { personId: 'target-1' },
        user: { id: 'auth-caller' },
        supabase: supabase as never,
      } as never);
      throw new Error('expected handler to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
    }
  });
});
