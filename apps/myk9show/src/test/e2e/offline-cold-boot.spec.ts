import { test, expect, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { signInAsSecretary, signInAsExhibitor } from './helpers/testUsers';
import { goOffline, reportOffline, supabaseRouteGlob } from './helpers/offlineBackend';

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
 * Like `goOffline`, but the backend can be switched back on mid-test.
 *
 * Returns `[interceptedCount, restore]`. `restore` stops aborting AND tells the
 * page it is online again — both halves matter: the app reads `navigator.onLine`
 * for its own banners, and the browser only fires `online` on a transition.
 */
async function goOfflineRestorable(
  context: BrowserContext,
  page: Page
): Promise<[() => number, () => Promise<void>]> {
  let intercepted = 0;
  let blocking = true;
  await context.route(supabaseRouteGlob(), route => {
    if (!blocking) return route.continue();
    intercepted += 1;
    return route.abort('internetdisconnected');
  });
  await context.addInitScript(() => {
    Object.defineProperty(window.navigator, 'onLine', { get: () => false, configurable: true });
  });

  const restore = async () => {
    blocking = false;
    await page.evaluate(() => {
      Object.defineProperty(window.navigator, 'onLine', { get: () => true, configurable: true });
      window.dispatchEvent(new Event('online'));
    });
  };

  return [() => intercepted, restore];
}

/**
 * True when the page is showing `ProtectedRoute`'s role-refusal fallback.
 *
 * Matched by its landmark, not by copy: MYK9-630 phase 3 replaced the
 * chrome-less "You don't have permission to access this page." line with the
 * in-shell `RoleAccessDeniedState`, whose heading differs by viewer role. The
 * property this spec cares about — did the cold boot demote a secretary? — is
 * about whether the refusal rendered at all.
 */
async function showsPermissionDenied(page: Page) {
  return page.getByTestId('role-access-denied').isVisible();
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
    const readyBadge = page
      .getByRole('status')
      .filter({ hasText: /offline ready|offline copy: saved/i });
    const primeButton = page.getByRole('button', { name: /save for show day/i });

    await expect(readyBadge.or(primeButton).first()).toBeVisible({ timeout: 45_000 });

    // If the device is not primed yet, use the badge's own recovery action —
    // that is the affordance MYK9-203 shipped, so exercising it is part of the test.
    // Decided inside the poll, never by one read: the page swaps its loading
    // branch for the class list, which remounts the badge, and a new badge
    // renders nothing until its first check. A one-shot read once landed in
    // that frame, skipped priming, and then waited on a device nothing was
    // priming (MYK9-766).
    await expectOfflineReady(page, 75_000, primeButton);

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
        .filter({ hasText: /offline ready|offline copy: saved/i })
        .or(page.getByRole('button', { name: /save for show day/i }))
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
    await expect(page.getByRole('button', { name: /save for show day/i })).toBeVisible({
      timeout: 45_000,
    });
    await expect(
      page.getByRole('status').filter({ hasText: /offline ready|offline copy: saved/i })
    ).toHaveCount(0);
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
  // MYK9-365. The recovery half. `lib/queryClient.ts` sets
  // `refetchOnReconnect: 'always'`, and that option is dead: TanStack drives it
  // from `onlineManager`, which starts `#online = true` and only changes on a
  // window online/offline EVENT. A page that BOOTS offline never gets one, so
  // when signal returns `setOnline(true)` finds `true` already there, no
  // listener runs, and the reconnect is swallowed.
  //
  // THE PAGE TEXT CANNOT PROVE THE HOOK (MYK9-1453). `<main>` now recovers in
  // about 4s with `useRefetchQueriesOnReconnect` removed, by two routes that do
  // not go through it: the reconnect replication pass refetches the entry list,
  // and the identity query (`userProfile`) is still mid-retry at the offline
  // mark, so its next attempt lands once the route reopens. The text check
  // below stays as the user-visible outcome, not as the hook's proof.
  //
  // The proof is the exhibitor profile read. Every profile reader on this page
  // shares the one `['exhibitorProfile', userId]` query, which sets
  // `retry: false` and a 5-minute staleTime, and nothing invalidates it; so
  // after the offline boot it sits in `error` and only a reconnect refetch can
  // re-issue it. Measured with the hook removed: zero `exhibitor_profiles`
  // requests in the 20s after reconnect. With it: one, as soon as the `online`
  // event fires. Two changes would make this pass without the hook, so re-check
  // that mutation after either: swapping in a query some other path also
  // refreshes, or a profile reader that first MOUNTS after reconnect (a
  // skeleton-to-content swap), since `refetchOnMount` refetches an errored query.
  test('react-query data returns when connectivity comes back, without a reload', async ({
    page,
    context,
  }) => {
    await signInAsExhibitor(page, '/exhibitor/entries');
    await page.waitForURL('**/exhibitor/entries', { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'My Shows', level: 1 })).toBeVisible({
      timeout: 45_000,
    });
    // Let the entry list finish arriving before measuring the healthy baseline. The gate is
    // the page's own "N class entries" status line, not a character count: how much text
    // `<main>` holds depends on the layout (it was 1,242 at the 1280px desktop width, so a
    // fixed 2,000 never passed there), whereas the relative comparisons below hold at any width.
    await expect(page.getByRole('status').filter({ hasText: /class entr/i })).toBeVisible({
      timeout: 45_000,
    });
    const healthyLength = (await page.locator('main').innerText()).length;

    const [interceptedCount, restoreConnectivity] = await goOfflineRestorable(context, page);
    await page.reload({ waitUntil: 'domcontentloaded' });

    // Degraded, and provably so — without this the recovery assertion below
    // could pass on a page that never lost anything.
    await expect(page.getByRole('heading', { name: 'My Shows', level: 1 })).toBeVisible({
      timeout: 45_000,
    });
    // Dwell long enough for every query to SETTLE into its error state before
    // reopening the route. This is load-bearing: at ~3s the initial queries are
    // still in flight, so restoring connectivity simply lets them succeed and
    // the test passes without any refetch happening at all. It did exactly that
    // until this wait was added — a green that measured nothing.
    await page.waitForTimeout(12_000);
    const offlineLength = (await page.locator('main').innerText()).length;
    expect(offlineLength).toBeLessThan(healthyLength / 2);
    expect(interceptedCount()).toBeGreaterThan(0);

    // Armed before the route reopens, so a refetch that fires on the `online`
    // event itself cannot be missed. A response, not a request: a read the
    // offline route aborted never gets one, so only a refetch that reached the
    // server counts. Signal returns. NO reload — that is the whole point.
    await Promise.all([
      page.waitForResponse(
        response =>
          response.request().method() === 'GET' &&
          /\/rest\/v1\/exhibitor_profiles\?/.test(response.url()),
        { timeout: 15_000 }
      ),
      restoreConnectivity(),
    ]);

    await expect
      .poll(async () => (await page.locator('main').innerText()).length, { timeout: 30_000 })
      .toBeGreaterThan(healthyLength / 2);

    // Still the same document: a reload here would invalidate the test.
    await expect(page).toHaveURL(/\/exhibitor\/entries/);
  });
});

/**
 * The readiness badge reads "Offline copy: saved on this device". On failure, name the signals the
 * not-ready badge reports as missing (MYK9-766: it once flipped back to not
 * ready with no clue why). With `primeWhenNotReady`, a not-ready badge is
 * clicked to prime the device, re-decided on every poll.
 */
async function expectOfflineReady(page: Page, timeout: number, primeWhenNotReady?: Locator) {
  // Reads that never wait: an auto-waiting read of an absent badge would hold
  // a poll iteration for the whole action timeout, missing a ready badge that
  // appears meanwhile and losing the diagnosis.
  const ready = page
    .getByRole('status')
    .filter({ hasText: /offline ready|offline copy: saved/i })
    .first();
  const notReady = page.locator('[data-offline-missing]');
  await expect
    .poll(
      async () => {
        if (await ready.isVisible()) return 'ready';
        const missing = await notReady.evaluateAll(els =>
          els.length === 0 ? null : (els[0]!.getAttribute('data-offline-missing') ?? '')
        );
        if (missing === null) {
          return 'no badge (readiness unknown: not computed yet, or a storage probe failed)';
        }
        const state = `not ready; missing: ${missing || '(none listed)'}`;
        // The badge is disabled while a prime runs, so this never stacks primes.
        if (
          primeWhenNotReady &&
          (await primeWhenNotReady.isVisible()) &&
          (await primeWhenNotReady.isEnabled({ timeout: 1_000 }).catch(() => false))
        ) {
          await primeWhenNotReady.click({ timeout: 5_000 }).catch(() => {});
          return `${state}; prime clicked`;
        }
        return state;
      },
      { timeout }
    )
    .toBe('ready');
}
