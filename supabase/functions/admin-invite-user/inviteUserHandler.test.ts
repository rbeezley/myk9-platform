import { describe, expect, it, vi } from 'vitest';

import {
  inviteUserHandler,
  resolveInviteRedirect,
  type InviteUserDeps,
} from './inviteUserHandler.ts';

function chain<T>(data: T, error: unknown = null) {
  const query: Record<string, unknown> = {};
  const self = () => query as unknown;
  query.select = vi.fn(self);
  query.eq = vi.fn(self);
  query.is = vi.fn(self);
  query.or = vi.fn(self);
  query.single = vi.fn(async () => ({ data, error }));
  query.maybeSingle = vi.fn(async () => ({ data, error }));
  query.then = ((resolve: (value: { data: T; error: unknown }) => unknown) =>
    Promise.resolve({ data, error }).then(resolve)) as never;
  return query;
}

interface MockOptions {
  callerPerson?: { id: string } | null;
  /** The target person row returned for body.personId (MYK9-134). */
  targetPerson?: { auth_user_id: string | null } | null;
  /** auth.admin.getUserById result for that person's identity. */
  identityUser?: { user: { email: string } | null } | null;
  rbacRoles?: Array<{ role: { name: string } | null }> | null;
  rbacError?: unknown;
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

  const getUserById = vi.fn(async () => ({
    data: opts.identityUser === undefined ? { user: null } : opts.identityUser,
    error: null,
  }));

  let peopleCall = 0;
  const from = vi.fn((table: string) => {
    if (table === 'people') {
      // First people query is the caller's site_admin check; the second (only
      // issued when body.personId is set) is the invite target.
      const isTarget = peopleCall++ > 0;
      if (isTarget) {
        return chain(opts.targetPerson === undefined ? null : opts.targetPerson);
      }
      return chain(opts.callerPerson === undefined ? { id: 'caller-1' } : opts.callerPerson);
    }
    if (table === 'user_roles') {
      return chain(
        opts.rbacRoles === undefined ? [{ role: { name: 'site_admin' } }] : opts.rbacRoles,
        opts.rbacError ?? null
      );
    }
    throw new Error(`unexpected table ${table}`);
  });

  return {
    supabase: { from, auth: { admin: { generateLink, getUserById } } },
    generateLink,
    getUserById,
  };
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

  it('fails closed when the role lookup errors', async () => {
    const { supabase, generateLink } = makeSupabase({ rbacError: { message: 'timeout' } });
    const { deps, sendEmail } = makeDeps();

    await expect(invoke(supabase, deps)).rejects.toMatchObject({
      status: 500,
      message: 'Failed to verify caller role',
    });
    expect(generateLink).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
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

    expect(result).toEqual({
      ok: true,
      outcome: 'invited',
      deliveredTo: 'new.secretary@example.test',
    });
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
    expect(result).toEqual({
      ok: true,
      outcome: 'reinvited',
      deliveredTo: 'new.secretary@example.test',
    });
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

    await expect(invoke(supabase, deps)).resolves.toMatchObject({ outcome: 'reinvited' });
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

describe('inviteUserHandler — redirect handling', () => {
  /** The URL actually placed in the delivered email. */
  function deliveredLink(sendEmail: { mock: { calls: unknown[][] } }): string {
    const payload = JSON.parse((sendEmail.mock.calls[0][0] as { body: string }).body);
    const match = /href="([^"]+auth\/callback[^"]*)"/.exec(payload.html as string);
    return (match?.[1] ?? '').replace(/&amp;/g, '&');
  }

  it('carries a relative destination through as returnTo on the callback', async () => {
    const { supabase, generateLink } = makeSupabase();
    const { deps, sendEmail } = makeDeps();

    await invoke(supabase, deps, { email: 'a@b.test', redirectPath: '/admin/users' });

    // buildAuthActionUrl only forwards redirect params from an /auth/callback
    // URL, so the destination has to ride ON the callback rather than replace it.
    expect(generateLink).toHaveBeenCalledWith(
      expect.objectContaining({
        options: { redirectTo: 'https://app.test/auth/callback?returnTo=%2Fadmin%2Fusers' },
      })
    );
    // Assert the FINAL emailed URL, not just the generateLink argument — the
    // regression this covers was the destination being dropped when the link
    // was rebuilt.
    expect(deliveredLink(sendEmail)).toContain('returnTo=%2Fadmin%2Fusers');
  });

  it('refuses an absolute redirect — the link is a single-use credential', async () => {
    const { supabase, generateLink } = makeSupabase();
    const { deps, sendEmail } = makeDeps();

    await invoke(supabase, deps, { email: 'a@b.test', redirectPath: 'https://evil.test/steal' });

    expect(generateLink).toHaveBeenCalledWith(
      expect.objectContaining({ options: { redirectTo: 'https://app.test/auth/callback' } })
    );
    expect(deliveredLink(sendEmail)).not.toContain('evil.test');
  });

  it('refuses a protocol-relative redirect', async () => {
    const { supabase, generateLink } = makeSupabase();
    const { deps, sendEmail } = makeDeps();

    await invoke(supabase, deps, { email: 'a@b.test', redirectPath: '//evil.test/steal' });

    expect(generateLink).toHaveBeenCalledWith(
      expect.objectContaining({ options: { redirectTo: 'https://app.test/auth/callback' } })
    );
    expect(deliveredLink(sendEmail)).not.toContain('evil.test');
  });

  it('preserves a destination already encoded on a callback path', async () => {
    // A prefix test on '/auth/callback' would treat this as the bare callback
    // and throw the destination away.
    const { supabase, generateLink } = makeSupabase({
      linkResults: [
        { data: null, error: { code: 'email_exists' } },
        { data: MAGIC_LINK, error: null },
      ],
    });
    const { deps, sendEmail } = makeDeps();

    await invoke(supabase, deps, {
      email: 'a@b.test',
      redirectPath: '/auth/callback?returnTo=%2Fadmin%2Fusers',
    });

    expect(generateLink).toHaveBeenLastCalledWith(
      expect.objectContaining({
        options: { redirectTo: 'https://app.test/auth/callback?returnTo=%2Fadmin%2Fusers' },
      })
    );
    expect(deliveredLink(sendEmail)).toContain('returnTo=%2Fadmin%2Fusers');
  });

  it('does not nest the callback inside itself when none was requested', async () => {
    const { supabase, generateLink } = makeSupabase();
    const { deps } = makeDeps();

    await invoke(supabase, deps, { email: 'a@b.test', redirectPath: '/auth/callback' });

    expect(generateLink).toHaveBeenCalledWith(
      expect.objectContaining({ options: { redirectTo: 'https://app.test/auth/callback' } })
    );
  });

  it('keeps the destination on a re-invite, which is where it actually matters', async () => {
    // A first invite always lands on password setup, so returnTo only changes
    // behaviour for the magiclink re-invite path.
    const { supabase } = makeSupabase({
      linkResults: [
        { data: null, error: { code: 'email_exists' } },
        { data: MAGIC_LINK, error: null },
      ],
    });
    const { deps, sendEmail } = makeDeps();

    await invoke(supabase, deps, { email: 'a@b.test', redirectPath: '/admin/users' });

    const link = deliveredLink(sendEmail);
    expect(link).toContain('returnTo=%2Fadmin%2Fusers');
    expect(link).toContain('type=magiclink');
  });
});

describe('resolveInviteRedirect', () => {
  const SITE = 'https://app.test';

  it.each([
    ['', 'https://app.test/auth/callback'],
    ['/admin/users', 'https://app.test/auth/callback?returnTo=%2Fadmin%2Fusers'],
    ['/auth/callback', 'https://app.test/auth/callback'],
    [
      '/auth/callback?returnTo=%2Fadmin%2Fusers',
      'https://app.test/auth/callback?returnTo=%2Fadmin%2Fusers',
    ],
    [
      '/shows/abc?tab=entries',
      'https://app.test/auth/callback?returnTo=%2Fshows%2Fabc%3Ftab%3Dentries',
    ],
  ])('resolves %s', (input, expected) => {
    expect(resolveInviteRedirect(SITE, input)).toBe(expected);
  });
});

describe('inviteUserHandler — identity vs contact email (MYK9-134)', () => {
  it('sends to the AUTH identity email when the contact email has drifted', async () => {
    // Nothing syncs people.email to auth.users.email. Inviting the drifted
    // contact address would ask GoTrue to mint a SECOND identity, which
    // handle_new_user then cannot adopt (its link branch needs auth_user_id
    // IS NULL) — it falls to INSERT and dies on people_email_unique.
    const { supabase, generateLink } = makeSupabase({
      targetPerson: { auth_user_id: 'auth-1' },
      identityUser: { user: { email: 'old.address@example.test' } },
      linkResults: [{ data: MAGIC_LINK, error: null }],
    });
    const { deps } = makeDeps();

    const result = await invoke(supabase, deps, {
      email: 'new.address@example.test',
      personId: 'person-1',
    });

    expect(generateLink).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'magiclink', email: 'old.address@example.test' })
    );
    expect(result).toMatchObject({ outcome: 'reinvited', deliveredTo: 'old.address@example.test' });
  });

  it('does not attempt an invite for someone who already has an identity', async () => {
    const { supabase, generateLink } = makeSupabase({
      targetPerson: { auth_user_id: 'auth-1' },
      identityUser: { user: { email: 'pat@example.test' } },
      linkResults: [{ data: MAGIC_LINK, error: null }],
    });
    const { deps } = makeDeps();

    await invoke(supabase, deps, { email: 'pat@example.test', personId: 'person-1' });

    // One call, and never type:'invite' — that would come back "already
    // registered" and waste a round trip.
    expect(generateLink).toHaveBeenCalledTimes(1);
    expect(generateLink).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'invite' }));
  });

  it('falls back to the requested email when the person has no identity yet', async () => {
    const { supabase, generateLink, getUserById } = makeSupabase({
      targetPerson: { auth_user_id: null },
    });
    const { deps } = makeDeps();

    const result = await invoke(supabase, deps, {
      email: 'fresh@example.test',
      personId: 'person-1',
    });

    expect(getUserById).not.toHaveBeenCalled();
    expect(generateLink).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'invite', email: 'fresh@example.test' })
    );
    expect(result).toMatchObject({ outcome: 'invited', deliveredTo: 'fresh@example.test' });
  });

  it('ignores identity resolution entirely when no personId is supplied', async () => {
    // The create flow has no person to resolve yet.
    const { supabase, getUserById } = makeSupabase();
    const { deps } = makeDeps();

    await invoke(supabase, deps, { email: 'brand.new@example.test' });

    expect(getUserById).not.toHaveBeenCalled();
  });
});

describe('inviteUserHandler — truthful delivery address + fail-closed lookup', () => {
  it('reports the identity address it actually delivered to, not the one asked for', async () => {
    // The operator must not be told the link went to the address they see on
    // the person record when it went to the drifted auth address.
    const { supabase } = makeSupabase({
      targetPerson: { auth_user_id: 'auth-1' },
      identityUser: { user: { email: 'old.address@example.test' } },
      linkResults: [{ data: MAGIC_LINK, error: null }],
    });
    const { deps } = makeDeps();

    const result = await invoke(supabase, deps, {
      email: 'new.address@example.test',
      personId: 'person-1',
    });

    expect(result.deliveredTo).toBe('old.address@example.test');
  });

  it('aborts when the person lookup errors instead of inviting the contact email', async () => {
    // Failing open here re-enters the duplicate-identity path this resolution
    // exists to prevent — on a transient database blip.
    const { supabase, generateLink } = makeSupabase({ targetPerson: null });
    const { deps, sendEmail } = makeDeps();

    await expect(
      invoke(supabase, deps, { email: 'pat@example.test', personId: 'person-1' })
    ).rejects.toMatchObject({ status: 503 });
    expect(generateLink).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('aborts when the identity exists but has no email', async () => {
    const { supabase, generateLink } = makeSupabase({
      targetPerson: { auth_user_id: 'auth-1' },
      identityUser: { user: null },
    });
    const { deps } = makeDeps();

    await expect(
      invoke(supabase, deps, { email: 'pat@example.test', personId: 'person-1' })
    ).rejects.toMatchObject({ status: 503 });
    expect(generateLink).not.toHaveBeenCalled();
  });
});
