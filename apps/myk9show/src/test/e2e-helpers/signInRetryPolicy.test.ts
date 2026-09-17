import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MAX_SIGN_IN_ATTEMPTS,
  SIGN_IN_LESSON_POINTER,
  SIGN_IN_RETRY_BACKOFF_MS,
  SIGN_IN_BREAKER_REARM_MS,
  SIGN_IN_TOTAL_BUDGET_MS,
  authGrantType,
  closeSignInBreaker,
  describeAuthTokenRefusal,
  findAuthTokenRefusal,
  decideSignInRetry,
  describeSignInRetry,
  isSignInBreakerOpen,
  openSignInBreaker,
  runSignInLadder,
  type AuthTokenResponse,
  type SignInAttemptFailure,
  type SignInRetryState,
} from './signInRetryPolicy';

/**
 * The PR-smoke shape, measured rather than assumed: a first attempt that
 * reached the password step and timed out on the 15s navigation budget costs
 * ~17s of real wall clock once `gotoSignIn` and the password-step wait are
 * counted. `lastAttemptMs` is that measured cost, NOT the configured budget —
 * the gap between the two is what let the old projection under-count.
 */
const afterFirstSmokeAttempt: SignInRetryState = {
  attemptsMade: 1,
  elapsedMs: 17_000,
  lastAttemptMs: 17_000,
  retriesEnabled: true,
};

const failure = (overrides: Partial<SignInAttemptFailure> = {}): SignInAttemptFailure => ({
  verdict: 'auth-never-returned',
  message: 'Sign-in did not complete for exhibitor@myk9t.com [auth-never-returned]: ...',
  cause: undefined,
  ...overrides,
});

beforeEach(() => {
  closeSignInBreaker();
});

describe('decideSignInRetry — which failures are worth a second try', () => {
  it('retries auth-never-returned, which is auth-service latency and not a verdict on the diff', () => {
    const decision = decideSignInRetry('auth-never-returned', afterFirstSmokeAttempt);
    expect(decision.retry).toBe(true);
    expect(decision.delayMs).toBe(SIGN_IN_RETRY_BACKOFF_MS[0]);
  });

  it.each([
    'rejected',
    'never-reached-password-step',
    'authenticated-but-not-navigated',
    'auth-rejected',
  ] as const)('never retries %s', verdict => {
    expect(decideSignInRetry(verdict, afterFirstSmokeAttempt).retry).toBe(false);
  });

  it('never retries when the caller opted out or the worker breaker is open', () => {
    const decision = decideSignInRetry('auth-never-returned', {
      ...afterFirstSmokeAttempt,
      retriesEnabled: false,
    });
    expect(decision.retry).toBe(false);
    expect(decision.reason).toMatch(/disabled/);
  });
});

describe('decideSignInRetry — bounds, asserted with the REAL constants', () => {
  it('reaches its own ceiling: every backoff entry is used before the attempts run out', () => {
    // A ladder whose last attempt is unreachable is a lie in the constants.
    // Walk the real ladder at the smoke suite's measured attempt cost and
    // require each attempt up to MAX to be offered.
    expect(SIGN_IN_RETRY_BACKOFF_MS).toHaveLength(MAX_SIGN_IN_ATTEMPTS - 1);

    let elapsedMs = 0;
    for (let attemptsMade = 1; attemptsMade < MAX_SIGN_IN_ATTEMPTS; attemptsMade += 1) {
      elapsedMs += 17_000;
      const decision = decideSignInRetry('auth-never-returned', {
        attemptsMade,
        elapsedMs,
        lastAttemptMs: 17_000,
        retriesEnabled: true,
      });
      expect(decision.retry).toBe(true);
      expect(decision.delayMs).toBe(SIGN_IN_RETRY_BACKOFF_MS[attemptsMade - 1]);
      elapsedMs += decision.delayMs;
    }
  });

  it('stops at the attempt ceiling', () => {
    const decision = decideSignInRetry('auth-never-returned', {
      attemptsMade: MAX_SIGN_IN_ATTEMPTS,
      elapsedMs: 100,
      lastAttemptMs: 100,
      retriesEnabled: true,
    });
    expect(decision.retry).toBe(false);
    expect(decision.reason).toContain('attempt');
  });

  it('refuses a retry an expensive attempt could not finish inside the total budget', () => {
    // The real cost of attempt 0 in job 34928991476: 32.2s, 30s of it spent in
    // a `page.goto(..., networkidle)` that the 15s navigation budget never saw.
    // Projecting from the budget instead of the measurement said "retry" and
    // would have pushed the test past its 60s timeout, replacing the
    // [auth-never-returned] signature with a bare `Test timeout`.
    const decision = decideSignInRetry('auth-never-returned', {
      attemptsMade: 1,
      elapsedMs: 32_200,
      lastAttemptMs: 32_200,
      retriesEnabled: true,
    });
    expect(decision.retry).toBe(false);
    expect(decision.reason).toContain('budget');
  });

  it('projects the next attempt from the MEASURED cost, not the configured budget', () => {
    // The distinguishing case, and the only one that can fail if `lastAttemptMs`
    // is swapped back for the 15000 navigation budget: the two formulas
    // disagree here and agree everywhere else.
    //   measured: 20000 + 1500 + 30000 = 51500 > 45000  -> refuse
    //   budget:   20000 + 1500 + 15000 = 36500 <= 45000 -> retry, and the test
    //             then runs past its 60s timeout and the log shows a bare
    //             `Test timeout` with no [auth-never-returned] in it.
    const decision = decideSignInRetry('auth-never-returned', {
      attemptsMade: 1,
      elapsedMs: 20_000,
      lastAttemptMs: 30_000,
      retriesEnabled: true,
    });
    expect(decision.retry).toBe(false);
    expect(decision.reason).toContain('30000ms');
    expect(decision.reason).toContain('51500ms');
  });

  it('leaves the CI per-test timeout room for the assertions after the sign-in', () => {
    expect(SIGN_IN_TOTAL_BUDGET_MS).toBeLessThan(60_000);
  });
});

describe('describeSignInRetry', () => {
  it('logs the attempt, the verdict, the measured elapsed time and the delay', () => {
    const line = describeSignInRetry('exhibitor@myk9t.com', 'auth-never-returned', {
      ...afterFirstSmokeAttempt,
      ...decideSignInRetry('auth-never-returned', afterFirstSmokeAttempt),
    });
    expect(line).toContain('exhibitor@myk9t.com');
    expect(line).toContain('auth-never-returned');
    expect(line).toContain('attempt 1');
    expect(line).toContain('17000ms');
    expect(line).toContain(`${SIGN_IN_RETRY_BACKOFF_MS[0]}ms`);
  });
});

describe('runSignInLadder', () => {
  /** A fake clock that advances by whatever each attempt claims to have cost. */
  const clock = (costsMs: number[]) => {
    let t = 0;
    const costs = [...costsMs];
    return {
      now: () => t,
      spend: () => {
        t += costs.shift() ?? 0;
      },
      wait: async (ms: number) => {
        t += ms;
      },
      at: () => t,
    };
  };

  it('returns as soon as an attempt succeeds and never waits', async () => {
    const c = clock([5000]);
    const wait = vi.fn(c.wait);
    const attempt = vi.fn(async () => {
      c.spend();
      return null;
    });

    await runSignInLadder('exhibitor@myk9t.com', {
      attempt,
      wait,
      now: c.now,
      log: vi.fn(),
      retriesEnabled: true,
    });

    expect(attempt).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
    expect(isSignInBreakerOpen(0)).toBe(false);
  });

  it('retries once, logs the retry, and succeeds', async () => {
    const c = clock([17_000, 6000]);
    const log = vi.fn();
    let call = 0;
    const attempt = vi.fn(async () => {
      c.spend();
      call += 1;
      return call === 1 ? failure() : null;
    });

    await runSignInLadder('exhibitor@myk9t.com', {
      attempt,
      wait: c.wait,
      now: c.now,
      log,
      retriesEnabled: true,
    });

    expect(attempt).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]?.[0]).toContain('auth-never-returned');
    expect(c.at()).toBe(17_000 + SIGN_IN_RETRY_BACKOFF_MS[0]! + 6000);
  });

  it('never exceeds MAX_SIGN_IN_ATTEMPTS, and the final error carries the verdict and the lesson', async () => {
    const c = clock(Array(10).fill(17_000));
    const attempt = vi.fn(async () => {
      c.spend();
      return failure();
    });

    await expect(
      runSignInLadder('exhibitor@myk9t.com', {
        attempt,
        wait: c.wait,
        now: c.now,
        log: vi.fn(),
        retriesEnabled: true,
      })
    ).rejects.toThrow(new RegExp(`auth-never-returned[\\s\\S]*${SIGN_IN_LESSON_POINTER}`));

    expect(attempt).toHaveBeenCalledTimes(MAX_SIGN_IN_ATTEMPTS);
  });

  it('passes a rejection straight through on the first attempt, with its cause', async () => {
    const c = clock([2000]);
    const cause = new Error('underlying');
    const attempt = vi.fn(async () => {
      c.spend();
      return failure({
        verdict: 'auth-rejected',
        message: 'auth returned 429',
        cause,
      });
    });

    await expect(
      runSignInLadder('exhibitor@myk9t.com', {
        attempt,
        wait: c.wait,
        now: c.now,
        log: vi.fn(),
        retriesEnabled: true,
      })
    ).rejects.toMatchObject({ cause });
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('opens the worker breaker once a ladder gives up, so later sign-ins take one shot', async () => {
    const first = clock(Array(10).fill(17_000));
    const firstAttempt = vi.fn(async () => {
      first.spend();
      return failure();
    });
    await expect(
      runSignInLadder('exhibitor@myk9t.com', {
        attempt: firstAttempt,
        wait: first.wait,
        now: first.now,
        log: vi.fn(),
        retriesEnabled: true,
      })
    ).rejects.toThrow();
    expect(firstAttempt).toHaveBeenCalledTimes(MAX_SIGN_IN_ATTEMPTS);
    expect(isSignInBreakerOpen(first.at())).toBe(true);

    // During the degradation window every concurrent test would otherwise
    // double its grants against the one shared account.
    const second = clock(Array(10).fill(17_000));
    const secondAttempt = vi.fn(async () => {
      second.spend();
      return failure();
    });
    await expect(
      runSignInLadder('exhibitor@myk9t.com', {
        attempt: secondAttempt,
        wait: second.wait,
        now: second.now,
        log: vi.fn(),
        retriesEnabled: true,
      })
    ).rejects.toThrow();
    expect(secondAttempt).toHaveBeenCalledTimes(1);
  });

  it('takes exactly one attempt when the caller opted out of retries', async () => {
    const c = clock(Array(10).fill(17_000));
    const attempt = vi.fn(async () => {
      c.spend();
      return failure();
    });

    await expect(
      runSignInLadder('load-exhibitor@myk9t.com', {
        attempt,
        wait: c.wait,
        now: c.now,
        log: vi.fn(),
        retriesEnabled: false,
      })
    ).rejects.toThrow();

    expect(attempt).toHaveBeenCalledTimes(1);
  });
});

describe('findAuthTokenRefusal', () => {
  const at = (url: string, status: number, time: number): AuthTokenResponse => ({
    url,
    status,
    at: time,
  });
  const PASSWORD = '/auth/v1/token?grant_type=password';
  const REFRESH = '/auth/v1/token?grant_type=refresh_token';

  it('ignores a stale refresh-token 400 that lands before a successful password grant', () => {
    // supabase-js fires a refresh grant from a session an earlier test left
    // behind, and it 400s routinely. Reading it as the answer would report
    // auth-rejected for a sign-in that authenticated and was merely slow to
    // navigate -- unretryable, and it would latch the worker breaker for free.
    expect(findAuthTokenRefusal([at(REFRESH, 400, 10), at(PASSWORD, 200, 20)], 0)).toBeNull();
  });

  it('ignores a refresh-token 400 even when no password grant follows', () => {
    expect(findAuthTokenRefusal([at(REFRESH, 400, 10)], 0)).toBeNull();
  });

  it('reports the LAST password grant, so an early 400 followed by a 200 is a success', () => {
    expect(findAuthTokenRefusal([at(PASSWORD, 400, 10), at(PASSWORD, 200, 20)], 0)).toBeNull();
  });

  it('reports a refusal when the last password grant failed', () => {
    expect(findAuthTokenRefusal([at(PASSWORD, 200, 10), at(PASSWORD, 429, 20)], 0)).toEqual({
      status: 429,
      grantType: 'password',
      url: PASSWORD,
    });
  });

  it('ignores a refusal recorded before the submit: it belongs to the previous attempt', () => {
    expect(findAuthTokenRefusal([at(PASSWORD, 429, 10)], 50)).toBeNull();
  });

  it('returns null on silence, which is the auth-never-returned case worth retrying', () => {
    expect(findAuthTokenRefusal([], 0)).toBeNull();
  });

  it('reads the grant type out of the query, and copes with a URL that has none', () => {
    expect(authGrantType(PASSWORD)).toBe('password');
    expect(authGrantType(REFRESH)).toBe('refresh_token');
    expect(authGrantType('/auth/v1/token')).toBe('');
  });

  it('names the grant type and the status in the message', () => {
    const line = describeAuthTokenRefusal(
      'exhibitor@myk9t.com',
      { status: 429, grantType: 'password', url: PASSWORD },
      15_000
    );
    expect(line).toContain('auth-rejected');
    expect(line).toContain('grant_type=password');
    expect(line).toContain('429');
  });
});

describe('the worker circuit breaker', () => {
  it('re-arms itself after SIGN_IN_BREAKER_REARM_MS', () => {
    // A latch with no way back would let one blip in a worker's first minute
    // disable retries for its whole run -- a worse trade than the breaker makes.
    openSignInBreaker(1000);
    expect(isSignInBreakerOpen(1000 + SIGN_IN_BREAKER_REARM_MS - 1)).toBe(true);
    expect(isSignInBreakerOpen(1000 + SIGN_IN_BREAKER_REARM_MS)).toBe(false);
  });

  it('is not opened by auth-rejected: a 4xx is a fact about one credential', async () => {
    const attempt = vi.fn(async () =>
      failure({ verdict: 'auth-rejected', message: 'auth returned 400', cause: undefined })
    );
    await expect(
      runSignInLadder('exhibitor@myk9t.com', {
        attempt,
        wait: async () => undefined,
        now: () => 0,
        log: vi.fn(),
        retriesEnabled: true,
      })
    ).rejects.toThrow();
    expect(isSignInBreakerOpen(0)).toBe(false);
  });
});
