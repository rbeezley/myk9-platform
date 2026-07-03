import { describe, expect, it, vi } from 'vitest';

import {
  assertSendEmailAuthorization,
  assertSendEmailRateLimit,
  callerRoleAuthorizesEmailShow,
  SEND_EMAIL_CALLER_ROLE_SELECT,
  type SendEmailSupabaseClient,
} from './authz';

function chain<T>(data: T, error: unknown = null) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data, error })),
    then: undefined as never,
  };
  query.then = ((resolve: (value: { data: T; error: unknown }) => unknown) =>
    Promise.resolve({ data, error }).then(resolve)) as never;
  return query;
}

describe('send-email authorization helpers', () => {
  it('uses the denormalized user_roles auth_user_id role surface', () => {
    expect(SEND_EMAIL_CALLER_ROLE_SELECT).toContain('auth_user_id');
    expect(SEND_EMAIL_CALLER_ROLE_SELECT).not.toContain('people!inner');
  });

  it('authorizes site admins and scoped secretary roles for a show', () => {
    const show = { id: 'show-1', club_id: 'club-1' };

    expect(
      callerRoleAuthorizesEmailShow({ club_id: null, roles: { name: 'site_admin' } }, show)
    ).toBe(true);
    expect(
      callerRoleAuthorizesEmailShow({ club_id: 'club-1', roles: { name: 'secretary' } }, show)
    ).toBe(true);
    expect(
      callerRoleAuthorizesEmailShow(
        { show_id: 'show-1', club_id: 'club-2', roles: { name: 'trial_secretary' } },
        show
      )
    ).toBe(true);
    expect(
      callerRoleAuthorizesEmailShow({ club_id: 'club-2', roles: { name: 'secretary' } }, show)
    ).toBe(false);
  });

  it('denies an exhibitor with no show role before Resend can be invoked', async () => {
    const from = vi.fn((table: string) => {
      if (table === 'enrollments') {
        return chain({ id: 'registration-1', show: { id: 'show-1', club_id: 'club-1' } });
      }
      if (table === 'user_roles') {
        return chain([]);
      }
      throw new Error(`unexpected table ${table}`);
    });

    await expect(
      assertSendEmailAuthorization({
        supabase: { from, rpc: vi.fn() } as unknown as SendEmailSupabaseClient,
        user: { id: 'exhibitor-user' },
        data: { type: 'entry_decision', registrationId: 'registration-1' },
      })
    ).rejects.toThrow('Forbidden: show official role required');
  });

  it('allows a secretary of the show to send', async () => {
    const from = vi.fn((table: string) => {
      if (table === 'enrollments') {
        return chain({ id: 'registration-1', show: { id: 'show-1', club_id: 'club-1' } });
      }
      if (table === 'user_roles') {
        return chain([{ club_id: 'club-1', roles: { name: 'secretary' } }]);
      }
      throw new Error(`unexpected table ${table}`);
    });

    await expect(
      assertSendEmailAuthorization({
        supabase: { from, rpc: vi.fn() } as unknown as SendEmailSupabaseClient,
        user: { id: 'secretary-user' },
        data: { type: 'entry_decision', registrationId: 'registration-1' },
      })
    ).resolves.toBeUndefined();
  });

  it('rejects callers who exceed the per-user limiter', async () => {
    await expect(
      assertSendEmailRateLimit({
        supabase: {
          from: vi.fn(),
          rpc: vi.fn(async () => ({
            data: [{ allowed: false, message: 'Too many email sends' }],
            error: null,
          })),
        } as unknown as SendEmailSupabaseClient,
        userId: 'caller-user',
      })
    ).rejects.toThrow('Too many email sends');
  });
});
