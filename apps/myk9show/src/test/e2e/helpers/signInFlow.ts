/**
 * The Playwright half of the canonical sign-in: navigating to `/sign-in`,
 * driving the two-step credential form, and classifying whatever went wrong.
 *
 * Split out of `testUsers.ts` (MYK9-541) so that file stays an account
 * registry and a set of role wrappers. Nothing here reads `TEST_USERS`, so the
 * dependency runs one way only.
 *
 * The retry ladder that CONSUMES `attemptSignIn` lives in
 * `../../e2e-helpers/signInRetryPolicy`, outside `e2e/`, because vitest
 * excludes `**\/e2e\/**` and a ladder nothing can unit-test is a ladder
 * nobody has checked.
 */

import { expect, type Page } from '@playwright/test';

import {
  classifySignInFailure,
  describeSignInFailure,
  SUPABASE_AUTH_TOKEN_KEY_PATTERN,
} from '../../e2e-helpers/signInDiagnostics';
import {
  describeAuthTokenRefusal,
  findAuthTokenRefusal,
  type AuthTokenResponse,
  type SignInAttemptFailure,
} from '../../e2e-helpers/signInRetryPolicy';

/**
 * Whether supabase-js has written a session token for this origin. The key
 * pattern is passed in from `signInDiagnostics` rather than retyped, so the
 * in-page test and `isSupabaseAuthTokenKey` cannot drift apart.
 */
async function hasSupabaseSession(page: Page): Promise<boolean> {
  return page
    .evaluate(
      pattern => Object.keys(localStorage).some(key => new RegExp(pattern).test(key)),
      SUPABASE_AUTH_TOKEN_KEY_PATTERN
    )
    .catch(() => false);
}

/**
 * Navigate to `/sign-in` and wait for the credential field to render, retrying
 * once if the SPA shell is still booting (the dev server's first paint can lag
 * past the goto, leaving a "Loading…" body with no form yet).
 */
async function gotoSignIn(page: Page, signInPath: string): Promise<void> {
  const input = credentialInput(page);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.goto(signInPath, { waitUntil: 'commit' });

    try {
      await expect(input).toBeVisible({ timeout: 30000 });
      return;
    } catch (error) {
      const bodyText = await page
        .locator('body')
        .innerText({ timeout: 1000 })
        .catch(() => '');
      const shellStillBooting =
        bodyText.trim().length === 0 || /Loading page|Loading\.\.\./i.test(bodyText);

      if (attempt === 1 || !shellStillBooting) {
        throw error;
      }
    }
  }
}

/**
 * One pass over the real SmartSignInPage (Phase 1b "single email-or-passcode
 * front door") two-step flow:
 *   1. fill the single credential field (`credential-input`) with the email
 *   2. Continue — this reveals the password step *in place* (the password field
 *      does not exist in the DOM until this transition)
 *   3. fill `password-input` and submit (`sign-in-button`)
 *   4. wait for navigation off `/sign-in`
 *
 * Returns `null` on success and the classified failure otherwise, so
 * `runSignInLadder` can decide whether another attempt could help (MYK9-541).
 * EVERY failure path returns a classified failure, `gotoSignIn` included —
 * a raw Playwright error escaping here would reach the log without a verdict
 * in it, which is the one string an operator greps for. A credential
 * REJECTION still throws: no retry fixes a wrong password.
 */
export async function attemptSignIn(
  page: Page,
  email: string,
  password: string,
  returnTo: string,
  navigationTimeoutMs: number
): Promise<SignInAttemptFailure | null> {
  // The classifier keys on the page's rejection banner, and the helper only
  // waits for `invalid login credentials|user is banned`; SmartSignInPage
  // renders every other message as raw text in `#credential-error` with no
  // test id. A 429 on the shared account therefore looks identical to "no
  // session token" and would be RETRIED. Watch the token endpoint itself.
  const authResponses: AuthTokenResponse[] = [];
  const onResponse = (response: { url(): string; status(): number }) => {
    const url = response.url();
    if (!url.includes('/auth/v1/token')) return;
    const parsed = new URL(url);
    // pathname + search, not pathname: the grant type lives in the query, and
    // telling a password grant from a stale refresh grant is the whole job.
    authResponses.push({
      url: `${parsed.pathname}${parsed.search}`,
      status: response.status(),
      at: performance.now(),
    });
  };
  page.on('response', onResponse);

  try {
    return await runSignInAttempt();
  } finally {
    page.off('response', onResponse);
  }

  async function runSignInAttempt(): Promise<SignInAttemptFailure | null> {
    const attemptStartedAt = performance.now();

    try {
      const params = new URLSearchParams({ returnTo });
      await gotoSignIn(page, `/sign-in?${params.toString()}`);

      await credentialInput(page).fill(email);
      await continueButton(page).click();
    } catch (error) {
      return failureFrom(
        {
          email,
          budgetMs: navigationTimeoutMs,
          elapsedMs: Math.round(performance.now() - attemptStartedAt),
          finalUrl: page.url(),
          passwordStepReached: false,
          authTokenPresent: await hasSupabaseSession(page),
        },
        error,
        authResponses,
        // Nothing was submitted, so no password grant can belong to this
        // attempt; an infinite cutoff makes that explicit rather than relying
        // on the recorded timestamps to happen to be earlier.
        Number.POSITIVE_INFINITY
      );
    }

    // The email branch reveals the password sub-form ("we'll ask for your
    // password next"); wait for it before filling.
    const passwordStepStartedAt = performance.now();
    try {
      await expect(page.getByTestId('password-input')).toBeVisible({
        timeout: navigationTimeoutMs,
      });
    } catch (error) {
      return failureFrom(
        {
          email,
          budgetMs: navigationTimeoutMs,
          elapsedMs: Math.round(performance.now() - passwordStepStartedAt),
          finalUrl: page.url(),
          passwordStepReached: false,
          authTokenPresent: await hasSupabaseSession(page),
        },
        error,
        authResponses,
        // Nothing was submitted, so no password grant can belong to this
        // attempt; an infinite cutoff makes that explicit rather than relying
        // on the recorded timestamps to happen to be earlier.
        Number.POSITIVE_INFINITY
      );
    }
    await page.getByTestId('password-input').fill(password);

    const submittedAt = performance.now();
    await page.getByTestId('sign-in-button').click();
    const authErrorBanner = page.getByText(/invalid login credentials|user is banned/i).first();
    const signInResult = await Promise.race([
      page
        .waitForURL(url => !url.pathname.includes('/sign-in'), { timeout: navigationTimeoutMs })
        .then(() => 'signed-in' as const)
        .catch((error: unknown) => ({ error })),
      authErrorBanner
        .waitFor({ state: 'visible', timeout: navigationTimeoutMs })
        .then(async () => ({
          authError: (await authErrorBanner.textContent())?.trim() ?? 'auth rejected',
        }))
        .catch(() => new Promise<never>(() => undefined)),
    ]);

    if (typeof signInResult === 'object' && 'authError' in signInResult) {
      throw new Error(`E2E sign-in rejected ${email}: ${signInResult.authError}`);
    }

    // A bare `TimeoutError: page.waitForURL` cannot say whether authentication
    // never returned or returned and left the app slow — opposite fixes. Ask the
    // page which it was before giving up.
    if (typeof signInResult === 'object' && 'error' in signInResult) {
      return failureFrom(
        {
          email,
          budgetMs: navigationTimeoutMs,
          elapsedMs: Math.round(performance.now() - submittedAt),
          finalUrl: page.url(),
          passwordStepReached: true,
          authTokenPresent: await hasSupabaseSession(page),
          // Bounded: this runs only after the budget already expired, and
          // `textContent` on an absent banner would otherwise burn its own 30s
          // default before the failure is reported.
          authErrorText:
            (await authErrorBanner.textContent({ timeout: 1000 }).catch(() => null))?.trim() ||
            undefined,
        },
        signInResult.error,
        authResponses,
        submittedAt
      );
    }

    await page.waitForLoadState('domcontentloaded');
    await expect(page).not.toHaveURL(/\/sign-in/);
    return null;
  }
}

/**
 * Turn a snapshot into a classified failure.
 *
 * An HTTP error from the token endpoint outranks the page-derived verdict: the
 * auth service ANSWERED and said no, so "never returned" would be false and a
 * retry would answer a rate limit with more requests.
 */
function failureFrom(
  snapshot: Parameters<typeof describeSignInFailure>[0],
  cause: unknown,
  authResponses: readonly AuthTokenResponse[],
  submittedAt: number
): SignInAttemptFailure {
  const refusal = findAuthTokenRefusal(authResponses, submittedAt);
  if (refusal) {
    return {
      verdict: 'auth-rejected',
      message: describeAuthTokenRefusal(snapshot.email, refusal, snapshot.budgetMs),
      cause,
    };
  }

  return {
    verdict: classifySignInFailure(snapshot),
    message: describeSignInFailure(snapshot),
    cause,
  };
}

function credentialInput(page: Page) {
  return page
    .getByTestId('credential-input')
    .or(page.getByRole('textbox', { name: /Email or show passcode/i }))
    .first();
}

function continueButton(page: Page) {
  return page
    .getByTestId('continue-button')
    .or(page.getByRole('button', { name: 'Continue', exact: true }))
    .first();
}
