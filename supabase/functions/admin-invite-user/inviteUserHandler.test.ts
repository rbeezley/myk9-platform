import { describe, expect, it, vi } from 'vitest';

import { inviteUserHandler, type InviteUserDeps } from './inviteUserHandler.ts';

function chain<T>(data: T, error: unknown = null) {
  const query: Record<string, unknown> = {};
  const self = () => query as unknown;
  query.select = vi.fn(self);
  query.eq = vi.fn(self);
  query.is = vi.fn(self);
  query.single = vi.fn(async () => ({ data, error }));
  query.then = ((resolve: (value: { data: T; error: unknown }) => unknown) =>
    Promise.resolve({ data, error }).then(resolve)) as never;
  return query;
}

interface MockOptions {
  callerPerson?: { id: string } | null;
  rbacRoles?: Array<{ role: { name: string } | null }> | null;
  /** Queued generateLink results, consumed in call order. */
  linkResults?: Array<{ data: unknown; error: { message?: string; code?: string } | null }>;
}

// generateLink returns BOTH action_link and hashed_token. The handler must use
// hashed_token: action_link points at GoTrue's /verify, which lands the
// recipient with a URL fragment that AuthCallbackPage does not parse.
const INVITE_LINK = {
  properties: { action_link: 'https://gotrue.test/verify?token=raw', hashed_token: 'hash-abc' },
};
const MAGIC_LINK = {
  properties: { action_link: 'https://gotrue.test/verify?token=raw2', hashed_token: 'hash-xyz' },
};

function makeSupabase(opts: MockOptions = {}) {
  const results = opts.linkResults ?? [{ data: INVITE_LINK, error: null }];
  let call = 0;
  const generateLink = vi.fn(async () => results[Math.min(call++, results.length - 1)]);

  const from = vi.fn((table: string) => {
    if (table === 'people') {
      return chain(opts.callerPerson === undefined ? { id: 'caller-1' } : opts.callerPerson);
    }
    if (table === 'user_roles') {
      return chain(
        opts.rbacRoles === undefined ? [{ role: { name: 'site_admin' } }] : opts.rbacRoles
      );
    }
    throw new Error(`unexpected table ${table}`);
  });

  return { supabase: { from, auth: { admin: { generateLink } } }, generateLink };
}

function makeDeps(overrides: Partial<InviteUserDeps> = {}) {
  const sendEmail = vi.fn(async () => ({ ok: true, status: 200, text: async () => '' }));
  return {
    deps: {
      resendApiKey: 'test-key',
      siteUrl: 'https://app.test',
      fromEmail: 'myK9Show <notifications@myk9show.com>',
      sendEmail,
      ...overrides,
    } as unknown as InviteUserDeps,
    sendEmail,
  };
}

function invoke(
  supabase: unknown,
  deps: InviteUserDeps,
  body: Record<string, unknown> = { email: 'new.secretary@example.test' },
  user: unknown = { id: 'auth-caller' }
) {
  return inviteUserHandler({ body, user, supabase } as never, deps);
}

describe('inviteUserHandler — authorization', () => {
  it('rejects an unauthenticated caller with 401', async () => {
    const { supabase } = makeSupabase();
    const { deps } = makeDeps();

    // Called directly, not through `invoke` — passing `undefined` there would
    // fall back to the default authenticated user and vacuously pass.
    await expect(
      inviteUserHandler({ body: { email: 'a@b.test' }, user: undefined, supabase } as never, deps)
    ).rejects.toMatchObject({ status: 401 });
  });

  it('rejects a caller with no people row', async () => {
    const { supabase } = makeSupabase({ callerPerson: null });
    const { deps } = makeDeps();

    await expect(invoke(supabase, deps)).rejects.toMatchObject({
      status: 403,
      message: 'Caller not found',
    });
  });

  it('rejects a secretary — minting identities is site_admin only', async () => {
    const { supabase } = makeSupabase({ rbacRoles: [{ role: { name: 'secretary' } }] });
    const { deps } = makeDeps();

    await expect(invoke(supabase, deps)).rejects.toThrow('Unauthorized: requires site_admin role');
  });

  it('does not generate a link or send mail for an unauthorized caller', async () => {
    const { supabase, generateLink } = makeSupabase({ rbacRoles: [] });
    const { deps, sendEmail } = makeDeps();

    await expect(invoke(supabase, deps)).rejects.toMatchObject({ status: 403 });
    expect(generateLink).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe('inviteUserHandler — validation', () => {
  it('rejects a missing email with 400', async () => {
    const { supabase } = makeSupabase();
    const { deps } = makeDeps();

    await expect(invoke(supabase, deps, {})).rejects.toMatchObject({
      status: 400,
      message: 'email is required',
    });
  });

  it('fails loudly when Resend is not configured rather than reporting a phantom send', async () => {
    // The whole point of MYK9-131: never report success for an email that
    // cannot be delivered.
    const { supabase, generateLink } = makeSupabase();
    const { deps } = makeDeps({ resendApiKey: undefined });

    await expect(invoke(supabase, deps)).rejects.toMatchObject({
      status: 500,
      message: 'RESEND_API_KEY not configured',
    });
    expect(generateLink).not.toHaveBeenCalled();
  });
});

describe('inviteUserHandler — invitation', () => {
  it('invites a new address and reports outcome "invited"', async () => {
    const { supabase, generateLink } = makeSupabase();
    const { deps, sendEmail } = makeDeps();

    const result = await invoke(supabase, deps, { email: 'New.Secretary@Example.test' });

    expect(result).toEqual({ ok: true, outcome: 'invited' });
    expect(generateLink).toHaveBeenCalledTimes(1);
    expect(generateLink).toHaveBeenCalledWith({
      type: 'invite',
      // Lowercased to match the LOWER(email) unique index that handle_new_user
      // uses to adopt the admin-created people row.
      email: 'new.secretary@example.test',
      options: { redirectTo: 'https://app.test/auth/callback' },
    });
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('emails the generated link to the invitee', async () => {
    const { supabase } = makeSupabase();
    const { deps, sendEmail } = makeDeps();

    await invoke(supabase, deps);

    const init = sendEmail.mock.calls[0][0] as { body: string; headers: Record<string, string> };
    const payload = JSON.parse(init.body);
    expect(payload.to).toBe('new.secretary@example.test');
    // The app's own callback with the query shape AuthCallbackPage parses —
    // NOT GoTrue's action_link, which redirects with a fragment instead.
    expect(payload.html).toContain('/auth/callback?');
    expect(payload.html).toContain('token_hash=hash-abc');
    expect(payload.html).toContain('type=invite');
    expect(payload.html).not.toContain('gotrue.test');
    expect(init.headers['Idempotency-Key']).toBe('admin-invite-invited-new.secretary@example.test');
  });

  it('names the assigned roles in the email so the invite explains itself', async () => {
    const { supabase } = makeSupabase();
    const { deps, sendEmail } = makeDeps();

    await invoke(supabase, deps, { email: 'a@b.test', roleLabels: ['club_admin'] });

    const payload = JSON.parse((sendEmail.mock.calls[0][0] as { body: string }).body);
    expect(payload.html).toContain('club admin');
  });

  it('never returns the invitation link to the browser', async () => {
    const { supabase } = makeSupabase();
    const { deps } = makeDeps();

    const result = await invoke(supabase, deps);

    expect(JSON.stringify(result)).not.toContain('token');
  });
});

describe('inviteUserHandler — idempotency', () => {
  it('does not mint a second identity when the address is already registered', async () => {
    const { supabase, generateLink } = makeSupabase({
      linkResults: [
        { data: null, error: { code: 'email_exists', message: 'User already registered' } },
        { data: MAGIC_LINK, error: null },
      ],
    });
    const { deps } = makeDeps();

    const result = await invoke(supabase, deps);

    // Reported distinctly so the UI can say "already had an account" instead of
    // claiming a fresh invite went out.
    expect(result).toEqual({ ok: true, outcome: 'reinvited' });
    expect(generateLink).toHaveBeenNthCalledWith(2, expect.objectContaining({ type: 'magiclink' }));
  });

  it('recognises the message-only form of the already-registered error', async () => {
    const { supabase } = makeSupabase({
      linkResults: [
        { data: null, error: { message: 'A user with this email has already been registered' } },
        { data: MAGIC_LINK, error: null },
      ],
    });
    const { deps } = makeDeps();

    await expect(invoke(supabase, deps)).resolves.toEqual({ ok: true, outcome: 'reinvited' });
  });

  it('uses a different idempotency key for a re-invite so it is not swallowed', async () => {
    const { supabase } = makeSupabase({
      linkResults: [
        { data: null, error: { code: 'email_exists' } },
        { data: MAGIC_LINK, error: null },
      ],
    });
    const { deps, sendEmail } = makeDeps();

    await invoke(supabase, deps);

    const init = sendEmail.mock.calls[0][0] as { headers: Record<string, string> };
    expect(init.headers['Idempotency-Key']).toBe(
      'admin-invite-reinvited-new.secretary@example.test'
    );
  });
});

describe('inviteUserHandler — failure modes', () => {
  it('surfaces a generateLink failure as 500 with its message', async () => {
    const { supabase } = makeSupabase({
      linkResults: [{ data: null, error: { message: 'signups disabled' } }],
    });
    const { deps, sendEmail } = makeDeps();

    await expect(invoke(supabase, deps)).rejects.toMatchObject({
      status: 500,
      message: 'signups disabled',
    });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('reports 502 when the identity was created but the email failed', async () => {
    // Distinct from 500 on purpose: the operator must be told the account
    // exists and the invite did NOT go out.
    const { supabase } = makeSupabase();
    const { deps } = makeDeps({
      sendEmail: vi.fn(async () => ({
        ok: false,
        status: 422,
        text: async () => 'domain not verified',
      })) as unknown as InviteUserDeps['sendEmail'],
    });

    await expect(invoke(supabase, deps)).rejects.toMatchObject({
      status: 502,
      message: 'Invitation email failed to send',
    });
  });

  it('treats a link response with no hashed_token as a failure', async () => {
    const { supabase } = makeSupabase({ linkResults: [{ data: { properties: {} }, error: null }] });
    const { deps } = makeDeps();

    await expect(invoke(supabase, deps)).rejects.toMatchObject({ status: 500 });
  });
});

describe('inviteUserHandler — redirect safety', () => {
  it('honours a relative redirect path', async () => {
    const { supabase, generateLink } = makeSupabase();
    const { deps } = makeDeps();

    await invoke(supabase, deps, { email: 'a@b.test', redirectPath: '/admin/users' });

    expect(generateLink).toHaveBeenCalledWith(
      expect.objectContaining({ options: { redirectTo: 'https://app.test/admin/users' } })
    );
  });

  it('refuses an absolute redirect — the link is a single-use credential', async () => {
    const { supabase, generateLink } = makeSupabase();
    const { deps } = makeDeps();

    await invoke(supabase, deps, { email: 'a@b.test', redirectPath: 'https://evil.test/steal' });

    expect(generateLink).toHaveBeenCalledWith(
      expect.objectContaining({ options: { redirectTo: 'https://app.test/auth/callback' } })
    );
  });

  it('refuses a protocol-relative redirect', async () => {
    const { supabase, generateLink } = makeSupabase();
    const { deps } = makeDeps();

    await invoke(supabase, deps, { email: 'a@b.test', redirectPath: '//evil.test/steal' });

    expect(generateLink).toHaveBeenCalledWith(
      expect.objectContaining({ options: { redirectTo: 'https://app.test/auth/callback' } })
    );
  });
});
