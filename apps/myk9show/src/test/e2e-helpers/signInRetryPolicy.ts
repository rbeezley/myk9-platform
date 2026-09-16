/**
 * Whether a failed E2E sign-in is worth trying again, and how long to wait
 * first (MYK9-541).
 *
 * On 2026-09-15 the required `E2E PR Smoke` job went red on five executions
 * inside three and a half hours, every one of them carrying the
 * `auth-never-returned` verdict from `signInDiagnostics`, and every one of them
 * overlapping another smoke job signing the SAME `exhibitor@myk9t.com` account
 * in. Across the other 1267 non-overlapping executions of the same 30 days the
 * verdict never appeared once. The failing `it()` changed each time, so the red
 * could not be quarantined by name, and it was green on rerun every time — an
 * operator judgement call per occurrence on a required check.
 *
 * `auth-never-returned` means the password was submitted and GoTrue issued no
 * session inside the budget. That is auth-service latency, not a verdict on the
 * diff, and it is the ONE verdict worth retrying: the other three are either
 * the app saying no or the app being slow after auth already succeeded, and
 * retrying those only burns the test's remaining time.
 *
 * Pure on purpose — same reason as `signInDiagnostics`: vitest excludes
 * `**\/e2e\/**`, so the decision is unit-testable only from this directory.
 */

import type { SignInFailureVerdict } from './signInDiagnostics';

/**
 * The only verdict a retry can fix. `rejected` is a wrong credential,
 * `never-reached-password-step` is an app/form failure, and
 * `authenticated-but-not-navigated` already HAS a session — none of the three
 * gets better by asking GoTrue again.
 */
export const RETRYABLE_SIGN_IN_VERDICTS: readonly SignInFailureVerdict[] = ['auth-never-returned'];

/** Total attempts, first one included. */
export const MAX_SIGN_IN_ATTEMPTS = 3;

/** Pause before retry N, indexed by retries already taken. Fixed, not jittered, so the policy stays deterministic under test. */
export const SIGN_IN_RETRY_BACKOFF_MS: readonly number[] = [1500, 3000];

/**
 * Wall clock the whole ladder may consume, measured from the first attempt.
 *
 * Deliberately under `playwright.ci.config.ts`'s 60s per-test timeout, with
 * room left for the assertions that follow the sign-in. It is also what keeps
 * the G9 load harness out: that runner passes a 45s per-attempt budget
 * (`AUTH_STATE_SIGN_IN_TIMEOUT_MS`), so a second attempt cannot fit and no
 * retry is offered — 16 shards retrying in lockstep would amplify the very
 * load this policy exists to survive.
 */
export const SIGN_IN_TOTAL_BUDGET_MS = 40_000;

export interface SignInRetryState {
  /** Attempts already finished, failures included. */
  attemptsMade: number;
  /** Wall clock since the first attempt started, in ms. */
  elapsedMs: number;
  /** The per-attempt wait the next attempt would be given, in ms. */
  attemptBudgetMs: number;
}

export interface SignInRetryDecision {
  retry: boolean;
  /** How long to wait before the next attempt. 0 when not retrying. */
  delayMs: number;
  /** Why, in words, for the log line and the final error. */
  reason: string;
}

export function decideSignInRetry(
  verdict: SignInFailureVerdict,
  state: SignInRetryState
): SignInRetryDecision {
  if (!RETRYABLE_SIGN_IN_VERDICTS.includes(verdict)) {
    return { retry: false, delayMs: 0, reason: `${verdict} is not an auth-latency failure` };
  }

  if (state.attemptsMade >= MAX_SIGN_IN_ATTEMPTS) {
    return {
      retry: false,
      delayMs: 0,
      reason: `attempt ceiling reached (${MAX_SIGN_IN_ATTEMPTS})`,
    };
  }

  const delayMs = SIGN_IN_RETRY_BACKOFF_MS[state.attemptsMade - 1] ?? 0;
  const projectedMs = state.elapsedMs + delayMs + state.attemptBudgetMs;

  if (projectedMs > SIGN_IN_TOTAL_BUDGET_MS) {
    return {
      retry: false,
      delayMs: 0,
      reason: `another attempt would need ${projectedMs}ms of the ${SIGN_IN_TOTAL_BUDGET_MS}ms total budget`,
    };
  }

  return { retry: true, delayMs, reason: `${verdict} is auth-service latency, not the diff` };
}

/** One line per retry, so a green-after-retry run still says what it survived. Carries the address, never the password. */
export function describeSignInRetry(
  email: string,
  verdict: SignInFailureVerdict,
  outcome: SignInRetryState & SignInRetryDecision
): string {
  return (
    `E2E sign-in retry for ${email}: attempt ${outcome.attemptsMade} failed [${verdict}] ` +
    `after ${outcome.elapsedMs}ms; ${outcome.reason}; waiting ${outcome.delayMs}ms before ` +
    `attempt ${outcome.attemptsMade + 1} of at most ${MAX_SIGN_IN_ATTEMPTS}.`
  );
}
