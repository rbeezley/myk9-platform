import { describe, expect, it, vi } from 'vitest';

import { generateResetLinkHandler } from './generateResetLinkHandler.ts';

function chain<T>(data: T, error: unknown = null) {
  const query: Record<string, unknown> = {};
  const self = () => query as unknown;
  query.select = vi.fn(self);
  query.eq = vi.fn(self);
  query.is = vi.fn(self);
  query.or = vi.fn(self);
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
  linkData?: { properties?: { action_link?: string | null } } | null;
  linkError?: { message: string } | null;
}

function makeSupabase(opts: MockOptions = {}) {
  const generateLink = vi.fn(async () => ({
    data:
      opts.linkData === undefined
        ? { properties: { action_link: 'https://example.test/reset?token=abc' } }
        : opts.linkData,
    error: opts.linkError ?? null,
  }));

  const from = vi.fn((table: string) => {
    if (table === 'people') {
      return chain(
        opts.callerPerson === undefined ? { id: 'caller-1' } : opts.callerPerson,
        opts.callerError ?? null
      );
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
      admin: { generateLink },
    },
  };

  return { supabase, generateLink };
}

describe('generateResetLinkHandler', () => {
  it('rejects an unauthenticated caller with 401', async () => {
    const { supabase } = makeSupabase();

    await expect(
      generateResetLinkHandler({
        body: { targetEmail: 'exhibitor@example.com' },
        user: undefined,
        supabase: supabase as never,
      } as never)
    ).rejects.toMatchObject({ status: 401 });
  });

  it('rejects when the caller has no people row with 403', async () => {
    const { supabase } = makeSupabase({ callerPerson: null });

    await expect(
      generateResetLinkHandler({
        body: { targetEmail: 'exhibitor@example.com' },
        user: { id: 'auth-caller' },
        supabase: supabase as never,
      } as never)
    ).rejects.toMatchObject({ status: 403, message: 'Caller not found' });
  });

  it('rejects a non-site_admin caller with 403', async () => {
    const { supabase } = makeSupabase({ rbacRoles: [{ role: { name: 'secretary' } }] });

    await expect(
      generateResetLinkHandler({
        body: { targetEmail: 'exhibitor@example.com' },
        user: { id: 'auth-caller' },
        supabase: supabase as never,
      } as never)
    ).rejects.toThrow('Unauthorized: requires site_admin role');
  });

  it('fails closed when the role lookup errors', async () => {
    const { supabase, generateLink } = makeSupabase({ rbacError: { message: 'timeout' } });

    await expect(
      generateResetLinkHandler({
        body: { targetEmail: 'exhibitor@example.com' },
        user: { id: 'auth-caller' },
        supabase: supabase as never,
      } as never)
    ).rejects.toMatchObject({ status: 500, message: 'Failed to verify caller role' });
    expect(generateLink).not.toHaveBeenCalled();
  });

  it('rejects a missing targetEmail with 400', async () => {
    const { supabase } = makeSupabase();

    await expect(
      generateResetLinkHandler({
        body: {},
        user: { id: 'auth-caller' },
        supabase: supabase as never,
      } as never)
    ).rejects.toMatchObject({ status: 400, message: 'Missing required parameter: targetEmail' });
  });

  it('surfaces a Supabase admin.generateLink error as 500 with its message', async () => {
    const { supabase } = makeSupabase({ linkError: { message: 'user not found' } });

    await expect(
      generateResetLinkHandler({
        body: { targetEmail: 'exhibitor@example.com' },
        user: { id: 'auth-caller' },
        supabase: supabase as never,
      } as never)
    ).rejects.toMatchObject({ status: 500, message: 'user not found' });
  });

  it('falls back to a generic message when generateLink errors without one', async () => {
    const { supabase } = makeSupabase({ linkData: null, linkError: null });

    await expect(
      generateResetLinkHandler({
        body: { targetEmail: 'exhibitor@example.com' },
        user: { id: 'auth-caller' },
        supabase: supabase as never,
      } as never)
    ).rejects.toMatchObject({ status: 500, message: 'Failed to generate reset link' });
  });

  it('happy path: returns the recovery action link for a site_admin caller', async () => {
    const { supabase, generateLink } = makeSupabase();

    const result = await generateResetLinkHandler({
      body: { targetEmail: 'exhibitor@example.com' },
      user: { id: 'auth-caller' },
      supabase: supabase as never,
    } as never);

    expect(generateLink).toHaveBeenCalledWith({
      type: 'recovery',
      email: 'exhibitor@example.com',
    });
    expect(result).toEqual({
      success: true,
      link: 'https://example.test/reset?token=abc',
    });
  });

  it('returns a null link when the generated link has no action_link property', async () => {
    const { supabase } = makeSupabase({ linkData: { properties: {} } });

    const result = await generateResetLinkHandler({
      body: { targetEmail: 'exhibitor@example.com' },
      user: { id: 'auth-caller' },
      supabase: supabase as never,
    } as never);

    expect(result).toEqual({ success: true, link: null });
  });
});
