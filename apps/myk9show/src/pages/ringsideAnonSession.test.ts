/**
 * Unit tests for the account-less ringside sign-in orchestrator (Phase D).
 *
 * Asserts the three-step contract — anonymous sign-in (reused if present) →
 * validate-passcode (edge fn stamps the claim) → refreshSession (JWT carries it)
 * — plus the failure cleanups that must drop a dangling anon session.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  startAnonymousRingsideSession,
  endAnonymousRingsideSession,
} from './ringsideAnonSession';

const getSession = vi.fn();
const signInAnonymously = vi.fn();
const refreshSession = vi.fn();
const signOut = vi.fn();

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: (...a: unknown[]) => getSession(...a),
      signInAnonymously: (...a: unknown[]) => signInAnonymously(...a),
      refreshSession: (...a: unknown[]) => refreshSession(...a),
      signOut: (...a: unknown[]) => signOut(...a),
    },
  },
}));

const validatePasscode = vi.fn();
vi.mock('./validatePasscode', () => ({
  validatePasscode: (...a: unknown[]) => validatePasscode(...a),
}));

const noSession = { data: { session: null }, error: null };
const anonSession = {
  data: { session: { user: { id: 'anon-1', is_anonymous: true } } },
  error: null,
};
const accountSession = {
  data: { session: { user: { id: 'user-1', is_anonymous: false } } },
  error: null,
};
const okResult = {
  ok: true as const,
  role: 'judge',
  showId: 'show-x',
  showName: 'Spring Trial',
  sessionStamped: true,
};

describe('startAnonymousRingsideSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signInAnonymously.mockResolvedValue({ error: null });
    refreshSession.mockResolvedValue({ error: null });
    signOut.mockResolvedValue({ error: null });
    validatePasscode.mockResolvedValue(okResult);
  });

  it('signs in anonymously, validates, then refreshes so the JWT carries the claim', async () => {
    getSession.mockResolvedValue(noSession);

    const result = await startAnonymousRingsideSession('jh3k9');

    expect(signInAnonymously).toHaveBeenCalledTimes(1);
    expect(validatePasscode).toHaveBeenCalledWith('jh3k9');
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(signOut).not.toHaveBeenCalled();
    expect(result).toEqual(okResult);
  });

  it('reuses an existing anonymous session instead of minting another', async () => {
    getSession.mockResolvedValue(anonSession);

    await startAnonymousRingsideSession('jh3k9');

    expect(signInAnonymously).not.toHaveBeenCalled();
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  it('refuses to clobber a real account session (auth-restore race guard)', async () => {
    // A returning account whose session is mid-restore: useAuthContext.user is
    // still null, so a passcode could misroute here with a real session present.
    getSession.mockResolvedValue(accountSession);

    const result = await startAnonymousRingsideSession('jh3k9');

    expect(signInAnonymously).not.toHaveBeenCalled();
    expect(validatePasscode).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, kind: 'session', message: expect.any(String) });
  });

  it('fails closed when the passcode validated but the session was not stamped', async () => {
    getSession.mockResolvedValue(noSession);
    validatePasscode.mockResolvedValue({ ...okResult, sessionStamped: false });

    const result = await startAnonymousRingsideSession('jh3k9');

    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: false, kind: 'session', message: expect.any(String) });
  });

  it('returns a session error and never validates when anon sign-in fails', async () => {
    getSession.mockResolvedValue(noSession);
    signInAnonymously.mockResolvedValue({ error: { message: 'anon disabled' } });

    const result = await startAnonymousRingsideSession('jh3k9');

    expect(validatePasscode).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, kind: 'session', message: expect.any(String) });
  });

  it('drops the dangling anon session and surfaces the result on an invalid passcode', async () => {
    getSession.mockResolvedValue(noSession);
    const invalid = { ok: false, kind: 'invalid', message: 'nope' };
    validatePasscode.mockResolvedValue(invalid);

    const result = await startAnonymousRingsideSession('bad11');

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(refreshSession).not.toHaveBeenCalled();
    expect(result).toEqual(invalid);
  });

  it('signs out and returns a session error when the refresh fails', async () => {
    getSession.mockResolvedValue(noSession);
    refreshSession.mockResolvedValue({ error: { message: 'refresh failed' } });

    const result = await startAnonymousRingsideSession('jh3k9');

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: false, kind: 'session', message: expect.any(String) });
  });
});

describe('endAnonymousRingsideSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signOut.mockResolvedValue({ error: null });
  });

  it('signs out an anonymous session', async () => {
    getSession.mockResolvedValue(anonSession);
    await endAnonymousRingsideSession();
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('never signs out a real account session', async () => {
    getSession.mockResolvedValue(accountSession);
    await endAnonymousRingsideSession();
    expect(signOut).not.toHaveBeenCalled();
  });
});
