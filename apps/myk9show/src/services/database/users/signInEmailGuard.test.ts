import { describe, it, expect, beforeEach } from 'vitest';
import {
  decideSignInEmailChange,
  checkSignInEmailChange,
  SIGN_IN_EMAIL_LOCKED_CODE,
  SIGN_IN_EMAIL_UNVERIFIABLE_CODE,
} from './signInEmailGuard';
import { mockSupabase, createChainableQuery } from '@/test/mocks/supabase';

const LINKED = { authUserId: 'auth-1', currentEmail: 'handler@example.com' };
const UNLINKED = { authUserId: null, currentEmail: 'handler@example.com' };

describe('decideSignInEmailChange', () => {
  describe('a person with no auth identity', () => {
    it('may have their email changed — nothing signs in with it', () => {
      expect(decideSignInEmailChange(UNLINKED, 'corrected@example.com')).toMatchObject({
        allowed: true,
      });
    });

    it('may have an email added when they had none', () => {
      expect(
        decideSignInEmailChange({ authUserId: null, currentEmail: null }, 'new@example.com')
      ).toMatchObject({ allowed: true });
    });

    it('treats undefined auth_user_id the same as null', () => {
      expect(
        decideSignInEmailChange({ authUserId: undefined, currentEmail: 'a@b.com' }, 'c@d.com')
      ).toMatchObject({ allowed: true });
    });
  });

  describe('a person who can sign in', () => {
    it('is refused an actual change', () => {
      const decision = decideSignInEmailChange(LINKED, 'corrected@example.com');

      expect(decision.allowed).toBe(false);
      expect(decision).toMatchObject({ code: SIGN_IN_EMAIL_LOCKED_CODE });
    });

    it('explains that the address is the one they sign in with', () => {
      const decision = decideSignInEmailChange(LINKED, 'corrected@example.com');

      expect(decision.allowed).toBe(false);
      if (decision.allowed) return;
      expect(decision.message).toMatch(/signs in with/i);
    });

    // The save paths resend `email` untouched on every write —
    // `useUpdatePerson` builds it from `person.email` and `useProfileForm`
    // spreads the whole person — so refusing on "the field is present" rather
    // than "the value changed" would break every ordinary profile save.
    it('allows an unchanged email through', () => {
      expect(decideSignInEmailChange(LINKED, 'handler@example.com')).toMatchObject({
        allowed: true,
      });
    });

    it('allows a differently-cased unchanged email through', () => {
      expect(decideSignInEmailChange(LINKED, 'Handler@Example.COM')).toMatchObject({
        allowed: true,
      });
    });

    it('allows a whitespace-padded unchanged email through', () => {
      expect(decideSignInEmailChange(LINKED, '  handler@example.com  ')).toMatchObject({
        allowed: true,
      });
    });

    it('refuses clearing the email', () => {
      expect(decideSignInEmailChange(LINKED, null).allowed).toBe(false);
      expect(decideSignInEmailChange(LINKED, '').allowed).toBe(false);
    });

    // auth_user_id set with no people.email should not exist — handle_new_user
    // writes the address on both branches — but if it ever does, we still
    // cannot confirm what they sign in with, so we do not write a guess.
    it('refuses filling in an email that is currently empty', () => {
      expect(
        decideSignInEmailChange({ authUserId: 'auth-1', currentEmail: null }, 'guess@example.com')
          .allowed
      ).toBe(false);
    });
  });
});

// `updateUser` turns the reason into a filter on the write itself, so which
// reason comes back is load-bearing, not descriptive. `no-identity` must mean
// "unlinked AND the address is really changing" — that is the only case where
// a concurrent signup could adopt the row between the read and the write.
describe('decideSignInEmailChange reasons', () => {
  it('reports no-identity only when the address is actually changing', () => {
    expect(decideSignInEmailChange(UNLINKED, 'corrected@example.com')).toEqual({
      allowed: true,
      reason: 'no-identity',
    });
  });

  it('reports unchanged for an unlinked person resaving the same address', () => {
    expect(decideSignInEmailChange(UNLINKED, 'handler@example.com')).toEqual({
      allowed: true,
      reason: 'unchanged',
    });
  });

  it('reports unchanged for a linked person resaving the same address', () => {
    expect(decideSignInEmailChange(LINKED, 'handler@example.com')).toEqual({
      allowed: true,
      reason: 'unchanged',
    });
  });
});

describe('checkSignInEmailChange', () => {
  // The global setup resets the mock's implementation but not its call
  // history, so a `from` assertion here would otherwise be satisfiable by an
  // earlier test in this file — order-dependently, which CI's
  // `--sequence.shuffle` would eventually expose.
  beforeEach(() => {
    mockSupabase.from.mockClear();
  });

  it('reads the identity linkage for the person being updated', async () => {
    const chain = createChainableQuery({
      data: { auth_user_id: null, email: 'old@example.com' },
      error: null,
    });
    mockSupabase.from.mockReturnValue(chain);

    await checkSignInEmailChange('person-1', 'new@example.com');

    expect(mockSupabase.from).toHaveBeenCalledWith('people');
    const selectArg = (chain.select as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0][0] as string;
    expect(selectArg).toContain('auth_user_id');
    expect(selectArg).toContain('email');
    expect(chain.eq).toHaveBeenCalledWith('id', 'person-1');
  });

  it('refuses the change when the person has an identity', async () => {
    mockSupabase.from.mockReturnValue(
      createChainableQuery({
        data: { auth_user_id: 'auth-1', email: 'old@example.com' },
        error: null,
      })
    );

    const decision = await checkSignInEmailChange('person-1', 'new@example.com');

    expect(decision).toMatchObject({ allowed: false, code: SIGN_IN_EMAIL_LOCKED_CODE });
  });

  it('allows the change when the person has no identity', async () => {
    mockSupabase.from.mockReturnValue(
      createChainableQuery({
        data: { auth_user_id: null, email: 'old@example.com' },
        error: null,
      })
    );

    expect(await checkSignInEmailChange('person-1', 'new@example.com')).toMatchObject({
      allowed: true,
    });
  });

  // Fails closed, as admin-invite-user does for the same hazard (MYK9-134):
  // a lookup that errors must never read as "no linked account", or a
  // transient blip waves through the exact edit this guard exists to stop.
  it('refuses the change when the lookup errors', async () => {
    mockSupabase.from.mockReturnValue(
      createChainableQuery({ data: null, error: { message: 'network down' } })
    );

    const decision = await checkSignInEmailChange('person-1', 'new@example.com');

    expect(decision).toMatchObject({ allowed: false, code: SIGN_IN_EMAIL_UNVERIFIABLE_CODE });
  });

  it('refuses the change when the person cannot be found', async () => {
    mockSupabase.from.mockReturnValue(createChainableQuery({ data: null, error: null }));

    const decision = await checkSignInEmailChange('missing', 'new@example.com');

    expect(decision).toMatchObject({ allowed: false, code: SIGN_IN_EMAIL_UNVERIFIABLE_CODE });
  });
});
