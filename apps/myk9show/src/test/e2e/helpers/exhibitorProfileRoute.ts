/**
 * Serve the signed-in account's `exhibitor_profiles` row, built from that
 * account's LIVE identity.
 *
 * Every account needs one, not only exhibitors, and for two separate reasons:
 *
 * - Without it `ExhibitorOnboardingChecker` redirects every signed-in
 *   exhibitor route to `/onboarding` (the exhibitor fixture's reason).
 * - `useCurrentPersonId` reads `person_id` off this row, and nothing else. A
 *   secretary is exempt from the redirect, so a missing row does not show as a
 *   redirect for them. Instead every person-keyed query stays disabled, and
 *   the dog roster reads as empty. The mail-in wizard then refused a dog it
 *   had just found: "All dogs in one registration must share the same owner."
 *
 * Staging lost both demo accounts' rows on 2026-09-20.
 *
 * IDENTITY IS RESOLVED, NEVER HARD-CODED. The auth uid comes from the app's
 * own request (`auth_user_id=eq.<uid>`), and the `people` row from a live read
 * made with that request's own credentials. A hard-coded `people.id` held only
 * on shared staging: the nightly regression run targets an isolated database
 * where the same accounts have different ids (Codex review, #2392).
 */
import type { Page, Route } from '@playwright/test';
import { fulfillRows } from './postgrestRoute';

export interface LivePerson {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

export interface ResolvedProfile {
  /** Settles once the app has asked for its own profile. */
  person: Promise<LivePerson>;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: Error): void;
}

export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  // Nothing may await it (a spec that never reaches a person-keyed read), and
  // an unobserved rejection must not crash the worker.
  promise.catch(() => undefined);
  return { promise, resolve, reject };
}

/**
 * Await a live identity value inside a route handler, failing the REQUEST
 * visibly (500 with the reason) instead of hanging it when it never arrives.
 */
export async function awaitIdentity<T>(
  route: Route,
  value: Promise<T>,
  what: string
): Promise<T | undefined> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`timed out resolving ${what}`)), 20_000)
  );
  try {
    return await Promise.race([value, timeout]);
  } catch (error) {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ message: `e2e fixture: ${(error as Error).message}` }),
    });
    return undefined;
  }
}

async function readLivePerson(route: Route, authUserId: string): Promise<LivePerson | undefined> {
  const url = new URL(route.request().url());
  const response = await route.fetch({
    url:
      `${url.origin}/rest/v1/people?select=id,first_name,last_name,email` +
      `&auth_user_id=eq.${encodeURIComponent(authUserId)}`,
    method: 'GET',
    // Plain JSON: the profile request may carry the single-object Accept.
    headers: { ...route.request().headers(), accept: 'application/json' },
  });
  if (!response.ok()) return undefined;
  const rows = (await response.json()) as LivePerson[];
  return rows[0];
}

export async function installExhibitorProfile(page: Page): Promise<ResolvedProfile> {
  const person = deferred<LivePerson>();
  const lookups = new Map<string, Promise<LivePerson | undefined>>();
  const STAMP = '2026-01-01T00:00:00.000Z';

  await page.route('**/rest/v1/exhibitor_profiles*', async route => {
    const filter = new URL(route.request().url()).searchParams.get('auth_user_id') ?? '';
    const authUserId = /^eq\.(.+)$/.exec(filter)?.[1];
    // Only the signed-in account's own lookup is served; anything else is live.
    if (!authUserId) return route.continue();

    // One live read per account: the profile is re-requested on refetch, and
    // a read still in flight when the test ends fails the test from inside
    // the route callback ("route.fetch: Test ended").
    let lookup = lookups.get(authUserId);
    if (!lookup) {
      lookup = readLivePerson(route, authUserId);
      lookups.set(authUserId, lookup);
    }
    let live: LivePerson | undefined;
    try {
      live = await lookup;
    } catch (error) {
      // The page or test is closing under us. Nothing is left to serve.
      if (page.isClosed() || /Test ended|closed/i.test(String(error))) return;
      throw error;
    }
    if (!live) {
      person.reject(new Error(`no people row for auth user ${authUserId}`));
      await fulfillRows(route, []);
      return;
    }
    person.resolve(live);
    // `onboarding_completed_at` is what `useExhibitorProfile` turns
    // `onboardingCompleted` on from; `person` mirrors the embed the query asks
    // for (`person:people!person_id(...)`).
    await fulfillRows(route, [
      {
        // Derived from the person so it is stable and distinct per account.
        id: `f1f1f1f1-0000-0000-0000-${live.id.replace(/-/g, '').slice(-12)}`,
        person_id: live.id,
        auth_user_id: authUserId,
        onboarding_completed_at: STAMP,
        created_at: STAMP,
        updated_at: STAMP,
        person: { ...live, phone: null, profile_image: null },
      },
    ]);
  });

  return { person: person.promise };
}
