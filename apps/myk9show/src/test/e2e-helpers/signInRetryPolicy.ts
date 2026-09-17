/**
 * Whether a failed E2E sign-in is worth trying again, how long to wait first,
 * and when to stop asking altogether (MYK9-541).
 *
 * On 2026-09-15 the required `E2E PR Smoke` job went red on five executions
 * inside three and a half hours, every one carrying the `auth-never-returned`
 * verdict from `signInDiagnostics`, and every one overlapping another smoke job
 * signing the SAME `exhibitor@myk9t.com` account in. The failing `it()` changed
 * each time, so the red could not be quarantined by name, and it was green on
 * rerun every time — an operator judgement call per occurrence on a required
 * check.
 *
 * `auth-never-returned` means the password was submitted and no session came
 * back inside the budget. It is the ONE verdict worth retrying: the others are
 * the app saying no, the form never advancing, or auth having already
 * succeeded, and none of the three gets better by asking again.
 *
 * Pure on purpose — same reason as `signInDiagnostics`: vitest excludes
 * `**\/e2e\/**`, so both the decision AND the ladder that consumes it are
 * unit-testable only from this directory. `runSignInLadder` therefore lives
 * here, taking its attempt, clock, sleep and log as arguments, rather than
 * being written inline in `testUsers.ts` where nothing could test it.
 */

import type { SignInFailureVerdict } from './signInDiagnostics';

/**
 * `signInDiagnostics`'s four verdicts plus one this module needs and that one
 * cannot produce.
 *
 * `auth-rejected` is an actual HTTP error from `/auth/v1/token` — a 429 rate
 * limit, a 5xx, a 400. `classifySignInFailure` cannot see those: it keys on the
 * page's rejection banner, and the helper only ever waits for the two phrases
 * `invalid login credentials|user is banned`, while `SmartSignInPage` renders
 * every other message as raw text in `#credential-error`. A 429 therefore
 * arrives at the classifier looking exactly like "no session token" and would
 * be retried — a rate limit answered by more requests. The caller watches the
 * token response directly and reports this verdict instead.
 */
export type SignInRetryVerdict = SignInFailureVerdict | 'auth-rejected';

/** The only verdict a retry can fix. */
export const RETRYABLE_SIGN_IN_VERDICTS: readonly SignInRetryVerdict[] = ['auth-never-returned'];

/**
 * Total attempts, the first one included.
 *
 * TWO, and the number is measured rather than chosen. A failed smoke sign-in
 * costs ~17s of real wall clock (the 15s navigation budget plus `gotoSignIn`
 * and the password-step wait), and `playwright.ci.config.ts` allows 60s per
 * test including everything the test does after signing in. Three attempts
 * cannot fit, so a third would be a constant nothing could reach — and a
 * ladder whose last rung is unreachable is a lie in the constants rather than
 * a safety margin. `signInRetryPolicy.test.ts` walks the real ladder at the
 * real cost and fails if any rung is unreachable.
 */
export const MAX_SIGN_IN_ATTEMPTS = 2;

/** Pause before retry N, indexed by retries already taken. Fixed, not jittered, so the policy stays deterministic under test. */
export const SIGN_IN_RETRY_BACKOFF_MS: readonly number[] = [1500];

/**
 * Wall clock the whole ladder may consume, measured from the first attempt.
 *
 * Under `playwright.ci.config.ts`'s 60s per-test timeout with room left for the
 * assertions that follow. The bound is only as good as what it is projected
 * from: an attempt pays `gotoSignIn` (a 30s visibility wait, itself retried
 * once) and the password-step wait as well as the 15s navigation budget, so
 * projecting the next attempt from the CONFIGURED budget under-counts. In job
 * 34928991476 the first attempt of the failing test cost 32.2s, 30s of it in a
 * `page.goto(..., networkidle)` the 15s budget never saw; a retry projected
 * from the budget would have said yes and pushed the test past 60s, and the log
 * would then show a bare `Test timeout` with no `[auth-never-returned]` in it —
 * erasing the signature the lesson exists to teach. `runSignInLadder` measures
 * each attempt and projects the next from the measurement.
 */
export const SIGN_IN_TOTAL_BUDGET_MS = 45_000;

/** Where an operator reads what a red `E2E PR Smoke` carrying this verdict means. */
export const SIGN_IN_LESSON_POINTER = 'docs/lessons/README.md#smoke-auth-never-returned';

export interface SignInRetryState {
  /** Attempts already finished, failures included. */
  attemptsMade: number;
  /** MEASURED wall clock since the first attempt started, in ms. */
  elapsedMs: number;
  /** MEASURED cost of the attempt that just failed, in ms — the projection basis for the next one. */
  lastAttemptMs: number;
  /** False when the caller opted out (the load harness) or this worker's breaker is open. */
  retriesEnabled: boolean;
}

export interface SignInRetryDecision {
  retry: boolean;
  /** How long to wait before the next attempt. 0 when not retrying. */
  delayMs: number;
  /** Why, in words, for the log line and the final error. */
  reason: string;
}

export function decideSignInRetry(
  verdict: SignInRetryVerdict,
  state: SignInRetryState
): SignInRetryDecision {
  if (!RETRYABLE_SIGN_IN_VERDICTS.includes(verdict)) {
    return {
      retry: false,
      delayMs: 0,
      reason: `${verdict} is not an auth-latency failure`,
    };
  }

  if (!state.retriesEnabled) {
    return {
      retry: false,
      delayMs: 0,
      reason: 'retries are disabled for this caller or this worker',
    };
  }

  if (state.attemptsMade >= MAX_SIGN_IN_ATTEMPTS) {
    return {
      retry: false,
      delayMs: 0,
      reason: `attempt ceiling reached (${MAX_SIGN_IN_ATTEMPTS})`,
    };
  }

  const delayMs = SIGN_IN_RETRY_BACKOFF_MS[state.attemptsMade - 1] ?? 0;
  const projectedMs = state.elapsedMs + delayMs + state.lastAttemptMs;

  if (projectedMs > SIGN_IN_TOTAL_BUDGET_MS) {
    return {
      retry: false,
      delayMs: 0,
      reason:
        `another attempt like the last one (${state.lastAttemptMs}ms) would need ` +
        `${projectedMs}ms of the ${SIGN_IN_TOTAL_BUDGET_MS}ms total budget`,
    };
  }

  return {
    retry: true,
    delayMs,
    reason: `${verdict} is auth-service latency, not the diff`,
  };
}

/** One line per retry, so a green-after-retry run still says what it survived. Carries the address, never the password. */
export function describeSignInRetry(
  email: string,
  verdict: SignInRetryVerdict,
  outcome: SignInRetryState & SignInRetryDecision
): string {
  return (
    `E2E sign-in retry for ${email}: attempt ${outcome.attemptsMade} failed [${verdict}] ` +
    `after ${outcome.lastAttemptMs}ms (${outcome.elapsedMs}ms elapsed); ${outcome.reason}; ` +
    `waiting ${outcome.delayMs}ms before attempt ${outcome.attemptsMade + 1} of at most ` +
    `${MAX_SIGN_IN_ATTEMPTS}.`
  );
}

/** A failed pass over the sign-in form, described and classified but not yet thrown. */
export interface SignInAttemptFailure {
  verdict: SignInRetryVerdict;
  message: string;
  cause: unknown;
}

export interface SignInLadderDeps {
  /** One pass over the form. Resolves `null` on success, the classified failure otherwise. */
  attempt: () => Promise<SignInAttemptFailure | null>;
  wait: (ms: number) => Promise<void>;
  now: () => number;
  log: (line: string) => void;
  /** The load harness passes false; see `LOAD_HARNESS_SIGN_IN_OPTIONS`. */
  retriesEnabled: boolean;
}

/**
 * Per-worker circuit breaker.
 *
 * Module scope is the point: a Playwright worker imports this module once, so
 * the flag is per worker and per process, which is the blast radius that
 * matters. During the degradation window EVERY test's sign-in fails, and
 * without the breaker every one of them would issue up to `MAX_SIGN_IN_ATTEMPTS`
 * grants against the one shared account — a mitigation that doubles the load it
 * was added to survive. Once one ladder has given up on an auth-service
 * verdict, later sign-ins in that worker take a single shot.
 */
let breakerOpen = false;

export function isSignInBreakerOpen(): boolean {
  return breakerOpen;
}

export function openSignInBreaker(): void {
  breakerOpen = true;
}

/** O(1) reset for `beforeEach`, and for a caller that knows the window has passed. */
export function closeSignInBreaker(): void {
  breakerOpen = false;
}

/** Verdicts that mean the auth service is refusing this worker's load, not that the credential is wrong. */
const BREAKER_VERDICTS: readonly SignInRetryVerdict[] = ['auth-never-returned', 'auth-rejected'];

/**
 * Run `attempt` until it succeeds or the policy says stop, logging each retry
 * and throwing the last failure's message when it gives up.
 *
 * The thrown message always carries the verdict, because every failure path in
 * the caller — including a `gotoSignIn` that never reached the form — is
 * converted to a `SignInAttemptFailure` before it gets here.
 */
export async function runSignInLadder(email: string, deps: SignInLadderDeps): Promise<void> {
  const retriesEnabled = deps.retriesEnabled && !isSignInBreakerOpen();
  const ladderStartedAt = deps.now();

  for (let attemptsMade = 1; ; attemptsMade += 1) {
    const attemptStartedAt = deps.now();
    const failure = await deps.attempt();
    if (!failure) return;

    const state: SignInRetryState = {
      attemptsMade,
      elapsedMs: Math.round(deps.now() - ladderStartedAt),
      lastAttemptMs: Math.round(deps.now() - attemptStartedAt),
      retriesEnabled,
    };
    const decision = decideSignInRetry(failure.verdict, state);

    if (!decision.retry) {
      if (BREAKER_VERDICTS.includes(failure.verdict)) openSignInBreaker();
      throw new Error(finalSignInMessage(failure, state, decision), {
        cause: failure.cause,
      });
    }

    deps.log(describeSignInRetry(email, failure.verdict, { ...state, ...decision }));
    await deps.wait(decision.delayMs);
  }
}

function finalSignInMessage(
  failure: SignInAttemptFailure,
  state: SignInRetryState,
  decision: SignInRetryDecision
): string {
  const ladder =
    state.attemptsMade > 1
      ? ` Gave up after ${state.attemptsMade} attempts in ${state.elapsedMs}ms: ${decision.reason}.`
      : ` No retry: ${decision.reason}.`;
  // Only the verdict the lesson is about gets the pointer; the others mean
  // something real about the change or the accounts and must not be waved off.
  const pointer =
    failure.verdict === 'auth-never-returned' ? ` See ${SIGN_IN_LESSON_POINTER}.` : '';

  return `${failure.message}${ladder}${pointer}`;
}
