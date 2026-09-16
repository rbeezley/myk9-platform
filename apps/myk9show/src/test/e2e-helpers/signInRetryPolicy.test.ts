import { describe, expect, it } from 'vitest';

import {
  MAX_SIGN_IN_ATTEMPTS,
  SIGN_IN_RETRY_BACKOFF_MS,
  SIGN_IN_TOTAL_BUDGET_MS,
  decideSignInRetry,
  describeSignInRetry,
  type SignInRetryState,
} from './signInRetryPolicy';

/** One 15s attempt has just expired — the PR-smoke shape (MYK9-541). */
const afterFirstSmokeAttempt: SignInRetryState = {
  attemptsMade: 1,
  elapsedMs: 15151,
  attemptBudgetMs: 15000,
};

describe('decideSignInRetry — which failures are worth a second try', () => {
  it('retries auth-never-returned, which is GoTrue latency and not a verdict on the app', () => {
    const decision = decideSignInRetry('auth-never-returned', afterFirstSmokeAttempt);
    expect(decision.retry).toBe(true);
    expect(decision.delayMs).toBe(SIGN_IN_RETRY_BACKOFF_MS[0]);
  });

  it('never retries a rejection: the account or password is wrong, and a retry only burns budget', () => {
    expect(decideSignInRetry('rejected', afterFirstSmokeAttempt).retry).toBe(false);
  });

  it('never retries never-reached-password-step: the form never advanced, which is app-side', () => {
    expect(decideSignInRetry('never-reached-password-step', afterFirstSmokeAttempt).retry).toBe(
      false
    );
  });

  it('never retries authenticated-but-not-navigated: auth already succeeded', () => {
    expect(decideSignInRetry('authenticated-but-not-navigated', afterFirstSmokeAttempt).retry).toBe(
      false
    );
  });
});

describe('decideSignInRetry — bounds', () => {
  it('stops at the attempt ceiling even when time remains', () => {
    const decision = decideSignInRetry('auth-never-returned', {
      attemptsMade: MAX_SIGN_IN_ATTEMPTS,
      elapsedMs: 300,
      attemptBudgetMs: 100,
    });
    expect(decision.retry).toBe(false);
    expect(decision.reason).toContain('attempt');
  });

  it('refuses a retry that could not finish inside the total budget', () => {
    // The G9 load harness passes a 45s per-attempt budget, so a second attempt
    // could not complete inside SIGN_IN_TOTAL_BUDGET_MS. 16 shards retrying in
    // lockstep is exactly the load this policy must not amplify.
    const decision = decideSignInRetry('auth-never-returned', {
      attemptsMade: 1,
      elapsedMs: 45_000,
      attemptBudgetMs: 45_000,
    });
    expect(decision.retry).toBe(false);
    expect(decision.reason).toContain('budget');
  });

  it('backs off further on the second retry than the first', () => {
    const second = decideSignInRetry('auth-never-returned', {
      attemptsMade: 2,
      elapsedMs: 8000,
      attemptBudgetMs: 4000,
    });
    expect(second.retry).toBe(true);
    expect(second.delayMs).toBeGreaterThan(SIGN_IN_RETRY_BACKOFF_MS[0]);
  });

  it('keeps every retry inside the CI per-test timeout', () => {
    // playwright.ci.config.ts allows 60s per test; the sign-in ladder must
    // leave room for the assertions that follow it.
    expect(SIGN_IN_TOTAL_BUDGET_MS).toBeLessThan(60_000);
    expect(SIGN_IN_RETRY_BACKOFF_MS).toHaveLength(MAX_SIGN_IN_ATTEMPTS - 1);
  });
});

describe('describeSignInRetry', () => {
  it('logs the attempt, the verdict, the elapsed budget and the delay', () => {
    const line = describeSignInRetry('exhibitor@myk9t.com', 'auth-never-returned', {
      ...afterFirstSmokeAttempt,
      ...decideSignInRetry('auth-never-returned', afterFirstSmokeAttempt),
    });
    expect(line).toContain('exhibitor@myk9t.com');
    expect(line).toContain('auth-never-returned');
    expect(line).toContain('attempt 1');
    expect(line).toContain('15151ms');
    expect(line).toContain(`${SIGN_IN_RETRY_BACKOFF_MS[0]}ms`);
  });
});
