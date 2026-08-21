import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { signInAsSecretary } from './helpers/testUsers';

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

  // KNOWN FAILING — documents MYK9-205, confirmed by this walk on 2026-08-20.
  //
  // This is the negative half of MYK9-203 AC 2, and the product does not yet
  // satisfy it. With the replicated show data gone and the backend
  // unreachable, the at-show page hits its error boundary BEFORE the readiness
  // badge renders, so the observed page is:
  //
  //   "Oops! Something went wrong / We couldn't load this show.
  //    Check your connection and try again. [Try Again]"
  //
  // The good news is the badge does not lie green. The bad news is it never
  // appears at all, so the "tap to prime" recovery MYK9-203 shipped is
  // unreachable in exactly the state it was built for, and the only offered
  // action — Try Again — cannot succeed while offline. (The MYK9-200 cache is
  // fine here: the "working offline, permissions as of ..." notice renders
  // correctly above the error.)
  //
  // Left as `fixme` rather than rewritten to assert the broken behaviour, so
  // the intended contract stays written down. When MYK9-205 is fixed this test
  // should be un-fixme'd and should pass as written.
  test.fixme('the readiness badge tells the truth when the device is NOT primed', async ({
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
});
