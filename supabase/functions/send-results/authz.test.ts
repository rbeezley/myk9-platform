import { describe, expect, it, vi } from 'vitest';

import {
  assertSendResultsAuthorization,
  callerRoleAuthorizesResults,
  deriveResultsAddresses,
  SEND_RESULTS_CALLER_ROLE_SELECT,
  type SendResultsSupabaseClient,
} from './authz';

function chain<T>(data: T, error: unknown = null) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    or: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data, error })),
    then: undefined as never,
  };
  query.then = ((resolve: (value: { data: T; error: unknown }) => unknown) =>
    Promise.resolve({ data, error }).then(resolve)) as never;
  return query;
}

// A `from` mock that answers shows / user_roles / people for the happy path.
function makeFrom(opts: {
  show: { id: string; club_id: string | null; secretary_email: string | null };
  roles: unknown[];
  callerEmail?: string | null;
}) {
  return vi.fn((table: string) => {
    if (table === 'shows') return chain(opts.show);
    if (table === 'user_roles') return chain(opts.roles);
    if (table === 'people') return chain({ email: opts.callerEmail ?? null });
    throw new Error(`unexpected table ${table}`);
  });
}

describe('send-results authorization predicate', () => {
  const show = { id: 'show-1', club_id: 'club-1' };

  it('queries the denormalized user_roles auth_user_id role surface', () => {
    expect(SEND_RESULTS_CALLER_ROLE_SELECT).toContain('auth_user_id');
    expect(SEND_RESULTS_CALLER_ROLE_SELECT).toContain('roles!inner(name)');
    expect(SEND_RESULTS_CALLER_ROLE_SELECT).not.toContain('people!inner');
  });

  it('denies a caller with no official role on the results show', () => {
    expect(callerRoleAuthorizesResults({ club_id: null, roles: { name: 'exhibitor' } }, show)).toBe(
      false
    );
    // A secretary scoped to a different club is not an official for this show.
    expect(
      callerRoleAuthorizesResults({ club_id: 'club-2', roles: { name: 'secretary' } }, show)
    ).toBe(false);
    // A club admin scoped to a different club is not an official for this show.
    expect(
      callerRoleAuthorizesResults({ club_id: 'club-2', roles: { name: 'club_admin' } }, show)
    ).toBe(false);
    // No role name at all fails closed.
    expect(callerRoleAuthorizesResults({ club_id: 'club-1' }, show)).toBe(false);
  });

  it('allows site/platform admins, show-scoped secretaries, and the club admin', () => {
    expect(
      callerRoleAuthorizesResults({ club_id: null, roles: { name: 'site_admin' } }, show)
    ).toBe(true);
    expect(
      callerRoleAuthorizesResults({ club_id: null, roles: { name: 'platform_admin' } }, show)
    ).toBe(true);
    expect(
      callerRoleAuthorizesResults({ club_id: 'club-1', roles: { name: 'secretary' } }, show)
    ).toBe(true);
    expect(
      callerRoleAuthorizesResults(
        { show_id: 'show-1', club_id: 'club-2', roles: { name: 'trial_secretary' } },
        show
      )
    ).toBe(true);
    // club_admin scoped to the show's club is authorized — matches the route guard.
    expect(
      callerRoleAuthorizesResults({ club_id: 'club-1', roles: { name: 'club_admin' } }, show)
    ).toBe(true);
  });
});

describe('send-results address derivation', () => {
  it('derives cc/reply-to from the show record, ignoring body-supplied values', () => {
    // The helper only accepts the show record + the caller's own email — a
    // body-supplied secretaryEmail has no path into the result.
    expect(deriveResultsAddresses({ secretary_email: 'secretary@bckc.org' }, null)).toEqual({
      secretaryEmail: 'secretary@bckc.org',
    });
  });

  it('falls back to the caller email when the show has no secretary email', () => {
    // Most app-created shows have a null secretary_email; the caller's own
    // (server-resolved) email preserves the reply-to-submitter behavior.
    expect(deriveResultsAddresses({ secretary_email: null }, 'caller@club.org')).toEqual({
      secretaryEmail: 'caller@club.org',
    });
    expect(deriveResultsAddresses({ secretary_email: '   ' }, 'caller@club.org')).toEqual({
      secretaryEmail: 'caller@club.org',
    });
  });

  it('prefers the show secretary email over the caller email', () => {
    expect(deriveResultsAddresses({ secretary_email: 'sec@club.org' }, 'caller@club.org')).toEqual({
      secretaryEmail: 'sec@club.org',
    });
  });

  it('returns null when neither the show nor the caller has an email', () => {
    expect(deriveResultsAddresses({ secretary_email: null }, null)).toEqual({
      secretaryEmail: null,
    });
    expect(deriveResultsAddresses({ secretary_email: '  ' }, '  ')).toEqual({
      secretaryEmail: null,
    });
  });
});

describe('assertSendResultsAuthorization', () => {
  it('denies a non-official caller before Resend can be invoked', async () => {
    const from = makeFrom({
      show: { id: 'show-1', club_id: 'club-1', secretary_email: 'sec@club.org' },
      roles: [],
    });

    await expect(
      assertSendResultsAuthorization({
        supabase: { from } as unknown as SendResultsSupabaseClient,
        user: { id: 'exhibitor-user' },
        showId: 'show-1',
      })
    ).rejects.toThrow('Forbidden: secretary or admin role required');
  });

  it('allows a secretary of the show and returns the show + caller email', async () => {
    const from = makeFrom({
      show: { id: 'show-1', club_id: 'club-1', secretary_email: 'sec@club.org' },
      roles: [{ club_id: 'club-1', roles: { name: 'secretary' } }],
      callerEmail: 'secretary@club.org',
    });

    await expect(
      assertSendResultsAuthorization({
        supabase: { from } as unknown as SendResultsSupabaseClient,
        user: { id: 'secretary-user' },
        showId: 'show-1',
      })
    ).resolves.toEqual({
      show: { id: 'show-1', club_id: 'club-1', secretary_email: 'sec@club.org' },
      callerEmail: 'secretary@club.org',
    });
  });

  it('allows a club admin scoped to the show club', async () => {
    const from = makeFrom({
      show: { id: 'show-1', club_id: 'club-1', secretary_email: null },
      roles: [{ club_id: 'club-1', roles: { name: 'club_admin' } }],
      callerEmail: 'admin@club.org',
    });

    await expect(
      assertSendResultsAuthorization({
        supabase: { from } as unknown as SendResultsSupabaseClient,
        user: { id: 'club-admin-user' },
        showId: 'show-1',
      })
    ).resolves.toEqual({
      show: { id: 'show-1', club_id: 'club-1', secretary_email: null },
      callerEmail: 'admin@club.org',
    });
  });

  it('rejects an unauthenticated caller (fail closed)', async () => {
    await expect(
      assertSendResultsAuthorization({
        supabase: { from: vi.fn() } as unknown as SendResultsSupabaseClient,
        user: undefined,
        showId: 'show-1',
      })
    ).rejects.toThrow('Unauthorized');
  });

  it('excludes expired role assignments from the authorization query', async () => {
    const userRolesQuery = chain([{ club_id: 'club-1', roles: { name: 'secretary' } }]);
    const from = vi.fn((table: string) => {
      if (table === 'shows') {
        return chain({ id: 'show-1', club_id: 'club-1', secretary_email: 'sec@club.org' });
      }
      if (table === 'user_roles') return userRolesQuery;
      if (table === 'people') return chain({ email: 'secretary@club.org' });
      throw new Error(`unexpected table ${table}`);
    });

    await assertSendResultsAuthorization({
      supabase: { from } as unknown as SendResultsSupabaseClient,
      user: { id: 'secretary-user' },
      showId: 'show-1',
    });

    // A role can stay is_active=true past its expiry — the query must also
    // filter on expires_at so a former temporary official cannot submit results.
    expect(userRolesQuery.or).toHaveBeenCalledWith('expires_at.is.null,expires_at.gt.now()');
  });
});
