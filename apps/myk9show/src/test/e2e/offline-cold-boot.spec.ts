import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { signInAsSecretary, signInAsExhibitor } from './helpers/testUsers';

/**
 * MYK9-200 AC 1 + MYK9-203 AC 2 — the verification neither issue could close
 * with unit tests: does a COLD BOOT with the backend unreachable actually keep
 * a signed-in secretary inside their show-day surfaces?
 *
 * Everything else about this fix is covered in jsdom. jsdom cannot prove it,
 * because the thing under test is a real page reload discarding all in-memory
 * state while localStorage and IndexedDB survive.
 *
 * How "offline" is simulated, and why this shape:
 *   - We abort requests to Supabase, NOT all network. The app bundle still
 *     comes from the dev server, which is exactly the venue scenario: the PWA
 *     serves its cached shell while the backend is unreachable. Killing all
 *     network would just yield a blank page and prove nothing.
 *   - The route is registered on the CONTEXT so it survives `page.reload()`.
 *     A `fetch` stub injected into the page would be wiped by the reload — the
 *     one event this test exists to exercise.
 */

const SHOW_ID = 'dededede-0000-0000-0000-000000000010'; // Heartland Scent Work Classic
const AT_SHOW_URL = `/at-show/${SHOW_ID}`;

/**
 * Derived from the CONFIGURED Supabase URL, not hard-coded to `*.supabase.co`.
 * The isolated/local E2E target runs Supabase at `http://127.0.0.1:54321`, which
 * a cloud-only glob matches zero times — `goOffline` would then be a silent
 * no-op and the "offline" assertions would run against a live backend.
 */
function supabaseRouteGlob(): string {
  const configured = process.env.VITE_SUPABASE_URL;
  if (!configured) return '**/*.supabase.co/**';
  try {
    return `${new URL(configured).origin}/**`;
  } catch {
    return '**/*.supabase.co/**';
  }
}

/**
 * Cut the backend off in a way that outlives a reload.
 *
 * Returns a count of intercepted requests. The caller asserts it is non-zero:
 * without that, a glob matching nothing would leave the app happily online and
 * every assertion below would still pass, turning this into a test that proves
 * the opposite of what it claims.
 */
async function goOffline(context: BrowserContext): Promise<() => number> {
  let intercepted = 0;
  await context.route(supabaseRouteGlob(), route => {
    intercepted += 1;
    return route.abort('internetdisconnected');
  });
  return () => intercepted;
}

/**
 * Report `navigator.onLine === false` for the whole context, across reloads.
 *
 * This is the app-facing half of "no signal": the offline banners, the network
 * status provider, and anything else reading `navigator.onLine` see a device
 * with no connectivity, not one on a captive venue Wi-Fi.
 *
 * It does NOT put TanStack Query into its paused state, and that surprised the
 * fix that added this test. `onlineManager` (query-core 5.x) initialises
 * `#online = true` unconditionally and only ever changes on a window
 * `online`/`offline` EVENT — it never reads `navigator.onLine`. A page that
 * BOOTS with no connectivity gets no such event, so every query fires, fails,
 * and lands in `status:'error'`. The paused shape needs a connectivity
 * transition while the page is already open, which a cold boot by definition
 * does not have. See the exhibitor test below for what that means for coverage.
 */
async function reportOffline(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    Object.defineProperty(window.navigator, 'onLine', { get: () => false, configurable: true });
  });
}

/** True when the page is showing the "no permission" fallback. */
async function showsPermissionDenied(page: Page) {
  return page.getByText(/don't have permission to access this page/i).isVisible();
}

// The cold-boot path involves a sign-in, a full show hydration, and a reload.
// Playwright's 30s default expires mid-hydration on a cold replica.
test.describe.configure({ timeout: 150_000 });

test.describe('offline cold boot', () => {
  test('secretary keeps show-day access after reloading with the backend unreachable', async ({
    page,
    context,
  }) => {
    // 1. Prime the device while online: session + RBAC cache + replicated show.
    await signInAsSecretary(page, AT_SHOW_URL);
    await page.waitForURL(`**${AT_SHOW_URL}`, { timeout: 30_000 });

    // The at-show page hydrates the show through syncAtShowData on mount.
    // Wait for the readiness badge to settle rather than a fixed sleep.
    const readyBadge = page.getByRole('status').filter({ hasText: /offline ready/i });
    const primeButton = page.getByRole('button', { name: /not offline ready/i });

    await expect(readyBadge.or(primeButton).first()).toBeVisible({ timeout: 45_000 });

    // If the device is not primed yet, use the badge's own recovery action —
    // that is the affordance MYK9-203 shipped, so exercising it is part of the test.
    if (await primeButton.isVisible().catch(() => false)) {
      await primeButton.click();
      await expect(readyBadge).toBeVisible({ timeout: 60_000 });
    }

    await expect(readyBadge).toBeVisible();

    // 2. Backend disappears, then a genuine cold boot.
    const interceptedCount = await goOffline(context);
    await page.reload({ waitUntil: 'domcontentloaded' });

    // 3. The assertions this whole arc exists for.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 45_000 });
    expect(await showsPermissionDenied(page)).toBe(false);

    // Permissions came from cache, and the UI says so (MYK9-200 AC 4).
    await expect(page.getByText(/working offline/i).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/saved permissions as of/i).first()).toBeVisible();

    // Prove the backend really was unreachable. If the route matched nothing,
    // everything above passed while ONLINE and means nothing.
    expect(interceptedCount()).toBeGreaterThan(0);
  });

  // The negative half of MYK9-203 AC 2, and the regression guard for MYK9-205.
  //
  // Until MYK9-205 this test could not pass. With the replicated show data
  // gone and Supabase unreachable, the boundary hit its generic error card
  // BEFORE the readiness badge rendered, so the page read:
  //
  //   "Oops! Something went wrong / We couldn't load this show.
  //    Check your connection and try again. [Try Again]"
  //
  // The badge never appeared at all, which made the "tap to prime" recovery
  // MYK9-203 shipped unreachable in exactly the state it was built for, and
  // the only offered action could not succeed. Note this route-abort setup
  // leaves `navigator.onLine` TRUE — the venue-Wi-Fi shape — which is why the
  // boundary attempted a sync and threw rather than taking the offline path.
  test('the readiness badge tells the truth when the device is NOT primed', async ({
    page,
    context,
  }) => {
    // The negative half of MYK9-203 AC 2. A badge that reads green on a device
    // that would actually fail is worse than no badge at all, so prove it goes
    // red when the local show data is gone.
    await signInAsSecretary(page, AT_SHOW_URL);
    await page.waitForURL(`**${AT_SHOW_URL}`, { timeout: 30_000 });
    await expect(
      page
        .getByRole('status')
        .filter({ hasText: /offline ready/i })
        .or(page.getByRole('button', { name: /not offline ready/i }))
        .first()
    ).toBeVisible({ timeout: 45_000 });

    // Wipe the replicated show data, leaving the session and RBAC cache intact.
    await page.evaluate(async () => {
      await new Promise<void>(resolve => {
        const request = indexedDB.deleteDatabase('myK9_Replication');
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        request.onblocked = () => resolve();
      });
    });

    await goOffline(context);
    await page.reload({ waitUntil: 'domcontentloaded' });

    // Must NOT claim the device is ready for a show it no longer holds.
    await expect(page.getByRole('button', { name: /not offline ready/i })).toBeVisible({
      timeout: 45_000,
    });
    await expect(page.getByRole('status').filter({ hasText: /offline ready/i })).toHaveCount(0);
  });
  // MYK9-347. The exhibitor half of this arc, and a different failure from the
  // secretary one above: nothing crashed and nothing was denied — the app was
  // confident, and wrong. `ExhibitorOnboardingChecker` wraps the ENTIRE route
  // tree and redirected on `!onboardingCompleted`, which is false whenever
  // `profile` is undefined. A fully onboarded exhibitor arriving at a venue was
  // bounced to /onboarding — a flow that cannot complete without a backend —
  // from every route, on every navigation, until signal returned.
  //
  // WHAT THIS TEST PROVES, precisely: an onboarded exhibitor who cold-boots with
  // the backend unreachable stays on the route they asked for. That is the
  // user-facing contract, and it is worth pinning end-to-end.
  //
  // WHAT IT DOES NOT PROVE: the `profileSettled` guard specifically. Removing
  // that guard leaves this test green (verified by mutation, 2026-09-03),
  // because a cold boot cannot reach the PAUSED query state the guard is for —
  // `onlineManager` starts optimistic (see `reportOffline`), so the profile
  // query fetches, fails, and errors, and the checker's older `profileError`
  // guard carries this case. The paused state is real but needs a connectivity
  // transition against an already-open page; it is pinned in jsdom instead, by
  // `components/exhibitor/__tests__/ExhibitorOnboardingChecker.test.tsx` ("does
  // not redirect while the profile query is paused offline"), which DOES fail
  // when the guard is removed. Do not read this test as that test's E2E twin.
  test('an onboarded exhibitor is not sent to /onboarding by a cold offline boot', async ({
    page,
    context,
  }) => {
    // 1. Prime online. Reaching My Shows proves this account IS onboarded —
    // without that, staying off /onboarding afterwards would prove nothing.
    await signInAsExhibitor(page, '/exhibitor/entries');
    await page.waitForURL('**/exhibitor/entries', { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'My Shows', level: 1 })).toBeVisible({
      timeout: 45_000,
    });

    // 2. No coverage at all, then a genuine cold boot.
    const interceptedCount = await goOffline(context);
    await reportOffline(context);
    await page.reload({ waitUntil: 'domcontentloaded' });

    // 3. Wait for the app to reach the state that ARMS the redirect rather than
    // for a fixed sleep: the cached-permissions notice means auth has settled
    // from localStorage + the RBAC cache, which is the precondition for the
    // checker's effect to run. Asserting the URL before that would pass on a
    // page that had not yet decided anything.
    await expect(page.getByText(/saved permissions as of/i).first()).toBeVisible({
      timeout: 45_000,
    });
    // The redirect is a replace() from an effect; give it room to land late.
    await page.waitForTimeout(3_000);

    // The assertion this test exists for.
    expect(page.url()).not.toContain('/onboarding');
    await expect(page).toHaveURL(/\/exhibitor\/entries/);
    expect(await showsPermissionDenied(page)).toBe(false);

    // Prove the app really was cut off. Without this the whole test could have
    // run ONLINE and passed on a live profile fetch.
    await expect(page.evaluate(() => navigator.onLine)).resolves.toBe(false);
    expect(interceptedCount()).toBeGreaterThan(0);
  });

  // MYK9-365. Staying on the route is necessary but not sufficient — the page
  // Richard captured in the 2026-09-03 exhibitor walk WAS on /exhibitor/entries
  // and still useless: `<main>` held nothing but an animated skeleton, forever.
  //
  // Cause: `ReplicationSyncProvider.triggerSync` returns early when offline
  // WITHOUT touching `tablesStatus`, so every table stays at its initial 'idle',
  // and `areReplicationTablesPendingFirstSync` counted 'idle' as "first sync
  // still coming". Offline that is never true, so the skeleton had no exit.
  //
  // The contract this pins is the one the audit asked for: previously loaded
  // entries remain usable, or a bounded explicit recovery state occupies the
  // main content. An indefinite skeleton is neither.
  test('a cold offline boot leaves usable content, not an endless skeleton', async ({
    page,
    context,
  }) => {
    await signInAsExhibitor(page, '/exhibitor/entries');
    await page.waitForURL('**/exhibitor/entries', { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'My Shows', level: 1 })).toBeVisible({
      timeout: 45_000,
    });

    const interceptedCount = await goOffline(context);
    await reportOffline(context);
    await page.reload({ waitUntil: 'domcontentloaded' });

    // The page shell must come back with its heading — the skeleton branch
    // replaces the WHOLE body including the <h1>, so this alone fails on the bug.
    await expect(page.getByRole('heading', { name: 'My Shows', level: 1 })).toBeVisible({
      timeout: 45_000,
    });

    // Settle, then require the main region to hold real, readable text. Before
    // the fix this was exactly 0 characters of innerText behind 501 characters
    // of pulsing divs, which is why "the page rendered" was not the right
    // question to ask.
    await page.waitForTimeout(3_000);
    const mainText = await page.locator('main').innerText();
    expect(mainText.trim().length).toBeGreaterThan(50);

    // And no skeleton may still be animating once we have settled.
    await expect(page.locator('main .animate-pulse')).toHaveCount(0);

    await expect(page.evaluate(() => navigator.onLine)).resolves.toBe(false);
    expect(interceptedCount()).toBeGreaterThan(0);
  });
});
