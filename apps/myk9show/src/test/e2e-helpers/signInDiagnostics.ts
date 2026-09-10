/**
 * Turns a sign-in that ran out of time into a verdict about WHY (MYK9-463).
 *
 * The G9 load rehearsal loses whole shards to `TimeoutError: page.waitForURL`
 * with nothing to say which half failed: authentication that never returned, or
 * authentication that returned and left the app slow to navigate. Those have
 * opposite fixes, and a bare TimeoutError distinguishes neither.
 *
 * Pure on purpose — the page interrogation lives in the caller so this logic is
 * unit-testable outside Playwright (vitest excludes `**\/e2e\/**`).
 */

export interface SignInFailureSnapshot {
  /** Account that was signing in. Never carries the password. */
  email: string;
  /** The wait that was allowed, in ms. */
  budgetMs: number;
  /** How long the wait actually took before giving up, in ms. */
  elapsedMs: number;
  /** Where the page was sitting when the budget expired. */
  finalUrl: string;
  /** Whether the two-step form advanced far enough to accept a password. */
  passwordStepReached: boolean;
  /** Whether a Supabase session token was in localStorage at the deadline. */
  authTokenPresent: boolean;
  /** Text of the credential-rejection banner, when one appeared. */
  authErrorText?: string;
}

export type SignInFailureVerdict =
  /** The app said no. Not a latency problem at all. */
  | 'rejected'
  /** The credential step never revealed the password field. */
  | 'never-reached-password-step'
  /** Password submitted, no session token: GoTrue never answered in time. */
  | 'auth-never-returned'
  /** Session token landed, URL never moved: the remaining cost is app-side. */
  | 'authenticated-but-not-navigated';

/**
 * True for the `sb-<project-ref>-auth-token` key supabase-js writes when a
 * session is issued.
 *
 * Deliberately NOT a `startsWith('sb-')` test: `sb-<ref>-auth-token-code-verifier`
 * is written at the START of the exchange, before any session exists. Counting
 * it would report "authenticated" for the precise case this module exists to
 * tell apart.
 */
export const SUPABASE_AUTH_TOKEN_KEY_PATTERN = '^sb-.+-auth-token$';

export function isSupabaseAuthTokenKey(key: string): boolean {
  return new RegExp(SUPABASE_AUTH_TOKEN_KEY_PATTERN).test(key);
}

export function classifySignInFailure(snapshot: SignInFailureSnapshot): SignInFailureVerdict {
  if (snapshot.authErrorText) return 'rejected';
  if (!snapshot.passwordStepReached) return 'never-reached-password-step';
  return snapshot.authTokenPresent ? 'authenticated-but-not-navigated' : 'auth-never-returned';
}

const NEXT_STEP: Record<SignInFailureVerdict, string> = {
  rejected: 'The account or password is wrong, or the user is banned — not a timeout.',
  'never-reached-password-step':
    'The credential step never advanced; check that the sign-in page rendered and Continue was clickable.',
  'auth-never-returned':
    'Authentication itself did not complete in the budget — look at auth-service latency and concurrency, not the app bundle.',
  'authenticated-but-not-navigated':
    'Authentication succeeded and the app was slow to leave /sign-in — look at post-auth app work, not the auth service.',
};

export function describeSignInFailure(snapshot: SignInFailureSnapshot): string {
  const verdict = classifySignInFailure(snapshot);
  const session = snapshot.authTokenPresent ? 'session token present' : 'no session token';
  const rejection = snapshot.authErrorText ? ` banner: "${snapshot.authErrorText}";` : '';

  return (
    `Sign-in did not complete for ${snapshot.email} [${verdict}]: ` +
    `waited ${snapshot.elapsedMs}ms of budget ${snapshot.budgetMs}ms;` +
    `${rejection} ${session}; ` +
    `password step ${snapshot.passwordStepReached ? 'reached' : 'not reached'}; ` +
    `stopped at ${snapshot.finalUrl}. ${NEXT_STEP[verdict]}`
  );
}
