import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MAX_SIGN_IN_ATTEMPTS,
  SIGN_IN_LESSON_POINTER,
  SIGN_IN_RETRY_BACKOFF_MS,
  SIGN_IN_TOTAL_BUDGET_MS,
  closeSignInBreaker,
  decideSignInRetry,
  describeSignInRetry,
  isSignInBreakerOpen,
  runSignInLadder,
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
    expect(isSignInBreakerOpen()).toBe(false);
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
    expect(isSignInBreakerOpen()).toBe(true);

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
