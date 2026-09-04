/**
 * Committed nightly route-health sweep.
 *
 * Replaces the per-run temp probe that was recreated and deleted each night.
 * Registered in docs/qa/e2e-suite-map.md under "Nightly Active".
 *
 * Per-route checks:
 *   render       – body innerText > 20 chars (not blank / stuck-loading)
 *   path         – final URL pathname matches expected route (not redirected to sign-in)
 *   console-err  – 0 (minus NOISE_PATTERNS documented below)
 *   repl-err     – 0 (QA-CONSOLE-ERROR-011 budget; regression guard)
 *   http-err     – 0 owned 4xx/5xx (from the app dev server or Supabase APIs)
 *   overflow375  – 0px horizontal overflow at 375px (routes flagged check375)
 *
 * Structure: one test per role group. Each test skips only when the credential
 * strings are explicitly absent before the test starts (no try/catch); any
 * sign-in failure propagates as a hard test failure so real auth/UI regressions
 * are visible. sweepRoutes() visits every route using expect.soft() so all
 * routes are checked even when individual assertions fail.
 *
 * Proof: run alone + full active Nightly Playwright command with --retries=0.
 */

import { expect, test, type Page } from '@playwright/test';
import { TEST_USERS } from './helpers/testUsers';
import { signIn } from './uat/shared/auth';
import { LIVE_SECRETARY_SHOW_ID } from './uat/shared/seededShows';
import {
  expectedRoutePath,
  routePathMatches,
  type RoutePathContract,
} from '../harness/routePathContract';
import {
  createBrowserHealth,
  watchBrowserHealth,
  type BrowserHealth,
} from './uat/shared/artifacts';
import {
  waitForAppApiRequestsToSettle,
  watchAppApiRequests,
} from '../harness/appApiRequestTracker';
import { logUnsettledAppApiRequests } from '../harness/routeHealthDiagnostics';

const SEEDED_SHOW = LIVE_SECRETARY_SHOW_ID;

// Response commit + fixed settle; the render/path checks below prove page readiness.
const SETTLE_MS = 1500;
const ROUTE_GOTO_TIMEOUT_MS = 15000;

// Console messages excluded from the error budget.
// "Maximum update depth exceeded" is React StrictMode dev-mode noise.
const NOISE_PATTERNS = ['Maximum update depth exceeded'];

// Console patterns that indicate the QA-CONSOLE-ERROR-011 replication flood.
// Closed as non-reproducing 2026-06-05; kept as a regression guard here.
const REPLICATION_PATTERNS = ['Sync failed', 'Failed to fetch', 'Database query failed'];

interface RouteSpec extends RoutePathContract {
  label: string;
  /** Measure horizontal overflow at 375px for this route. */
  check375?: boolean;
  /** Stable heading that proves a redirect reached the intended destination. */
  readyHeading?: string;
}

// ── Route lists ───────────────────────────────────────────────────────────────

const PUBLIC_ROUTES: RouteSpec[] = [
  { label: 'landing', path: '/', check375: true },
  { label: 'browse-shows', path: '/shows' },
  { label: 'show-detail', path: `/shows/${SEEDED_SHOW}` },
  { label: 'browse-clubs', path: '/clubs' },
];

const EXHIBITOR_ROUTES: RouteSpec[] = [
  { label: 'my-entries', path: '/exhibitor/entries' },
  { label: 'account', path: '/account' },
  { label: 'shows', path: '/shows' },
  { label: 'notifications', path: '/notifications' },
];

const SECRETARY_ROUTES: RouteSpec[] = [
  { label: 'dashboard', path: '/secretary/dashboard' },
  { label: 'wizard', path: '/secretary/create-show/wizard' },
  { label: 'entries', path: `/shows/${SEEDED_SHOW}/entry-management` },
  { label: 'reports', path: `/shows/${SEEDED_SHOW}/reports` },
  { label: 'settings', path: '/secretary/settings' },
  { label: 'people', path: '/people' },
  {
    label: 'workbench',
    path: `/shows/${SEEDED_SHOW}/setup`,
    // Setup is retained as a compatibility route; its content lives on the overview.
    expectedPath: `/shows/${SEEDED_SHOW}`,
    pathMatch: 'exact',
    readyHeading: 'Show schedule',
  },
];

const JUDGE_ROUTES: RouteSpec[] = [
  { label: 'dashboard', path: '/judge/dashboard' },
  { label: 'stats', path: '/judge/stats' },
  { label: 'check-in', path: '/judge/check-in' },
];

const CLUB_ADMIN_ROUTES: RouteSpec[] = [{ label: 'members', path: '/club-admin/members' }];

const ADMIN_ROUTES: RouteSpec[] = [
  { label: 'dashboard', path: '/admin/dashboard', check375: true },
  { label: 'health', path: '/admin/health' },
  { label: 'support', path: '/admin/support' },
  { label: 'users', path: '/admin/users' },
  { label: 'payouts', path: '/admin/payouts' },
  { label: 'permissions', path: '/admin/permissions' },
  { label: 'permissions-assignments', path: '/admin/permissions?tab=assignments' },
  { label: 'deleted-items', path: '/admin/deleted-items' },
  { label: 'templates', path: '/admin/templates' },
  { label: 'sync', path: '/admin/sync' },
  { label: 'role-requests', path: '/admin/role-requests' },
  { label: 'judges-analytics', path: '/admin/judges/analytics' },
  { label: 'help', path: '/admin/help' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function isNoise(text: string) {
  return NOISE_PATTERNS.some(p => text.includes(p));
}

function isReplicationError(text: string) {
  return REPLICATION_PATTERNS.some(p => text.includes(p));
}

/**
 * Filters a BrowserHealth summary for the budgeted error categories,
 * returning one string per violation.
 */
function violations(health: BrowserHealth): string[] {
  const result: string[] = [];
  for (const msg of health.pageErrors) {
    result.push(`pageerror: ${msg}`);
  }
  for (const msg of health.consoleErrors) {
    if (isNoise(msg)) continue;
    if (isReplicationError(msg)) {
      result.push(`repl-err: ${msg}`);
    } else {
      result.push(`console-err: ${msg}`);
    }
  }
  for (const msg of health.failedResponses) {
    result.push(`http-err: ${msg}`);
  }
  return result;
}

async function measureHorizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const overflowPx = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
    const sources = Array.from(document.querySelectorAll('*'))
      .map(element => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          className: String(element.className || '').slice(0, 120),
          text: (element.textContent || '').trim().slice(0, 80),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
        };
      })
      .filter(source => source.left < 0 || source.right > window.innerWidth)
      .slice(0, 3);

    return { overflowPx, sources, url: window.location.href };
  });
}

async function assertAppApiRequestsSettled(
  page: Page,
  pendingAppApiRequests: ReturnType<typeof watchAppApiRequests>,
  routeId: string
) {
  const settlement = await waitForAppApiRequestsToSettle(page, pendingAppApiRequests);
  expect
    .soft(settlement.settled, `${routeId}: app API requests did not settle before route transition`)
    .toBe(true);
  if (!settlement.settled) {
    const diagnostic = logUnsettledAppApiRequests(routeId, settlement.pendingUrls);
    test.info().annotations.push({
      type: 'route',
      description: `${routeId} unsettled-api-requests=${diagnostic}`,
    });
  }
}

/**
 * Visits each route, soft-asserting render, health, and overflow checks.
 * All routes are visited even when individual checks fail.
 */
async function sweepRoutes(
  page: Page,
  group: string,
  routes: RouteSpec[],
  pendingAppApiRequests: ReturnType<typeof watchAppApiRequests>
) {
  const health = createBrowserHealth();
  watchBrowserHealth(page, health);

  // Authentication lands on the first route before the sweep starts. Let any
  // API reads started by that navigation finish before the loop reloads it.
  await assertAppApiRequestsSettled(page, pendingAppApiRequests, `${group}/sign-in-target`);

  for (const route of routes) {
    const id = `${group}/${route.label}`;

    // Reset accumulated state from the previous route visit.
    health.consoleErrors.length = 0;
    health.pageErrors.length = 0;
    health.failedResponses.length = 0;
    // Including the in-flight API requests, which used to be the one piece of
    // per-route state this block forgot. `page.goto` below tears down the
    // current document, and a request still in flight when that happens may
    // never emit `requestfinished` or `requestfailed` — so it sat in `pending`
    // for the rest of the sweep and failed the settle assertion on every
    // REMAINING route, always naming the same stranded URLs.
    //
    // That is what made Nightly Health look like a product bug: the failing
    // ROLE migrated between runs (exhibitor 2026-09-01 and 09-03, secretary
    // 09-04 with exhibitor clean), and closing it on one role's symptom did not
    // stop it recurring. Run 33865556960 reported the identical two URLs as
    // unsettled on all five failing secretary routes, one of them a three-id
    // `people` read that cannot take five seconds five times in a row.
    //
    // Resetting here means a slow route is reported ONCE, against itself.
    pendingAppApiRequests.reset();

    let navigationError: string | null = null;
    try {
      await page.goto(route.path, {
        waitUntil: 'commit',
        timeout: ROUTE_GOTO_TIMEOUT_MS,
      });
      await page
        .waitForLoadState('domcontentloaded', { timeout: ROUTE_GOTO_TIMEOUT_MS })
        .catch(() => {
          test.info().annotations.push({
            type: 'route',
            description: `${id} domcontentloaded-not-observed-within=${ROUTE_GOTO_TIMEOUT_MS}ms`,
          });
        });
    } catch (error) {
      navigationError = error instanceof Error ? error.message : String(error);
    }

    expect
      .soft(navigationError, `${id}: navigation failed within ${ROUTE_GOTO_TIMEOUT_MS}ms`)
      .toBeNull();

    if (navigationError) {
      test.info().annotations.push({
        type: 'route',
        description: `${id} nav-failed=${navigationError}`,
      });
      continue;
    }

    // Compatibility routes can redirect after the initial response commits.
    // Wait for their declared canonical destination before evaluating render
    // and health so redirect timing cannot create an intermittent false alarm.
    await page
      .waitForURL(url => routePathMatches(route, url.pathname), {
        timeout: ROUTE_GOTO_TIMEOUT_MS,
      })
      .catch(() => undefined);

    // Render check: body must contain meaningful text (>20 chars).
    // This catches blank pages and pages stuck on "Loading page..." (14 chars).
    await page
      .waitForFunction(() => document.body.innerText.trim().length > 20, null, {
        timeout: ROUTE_GOTO_TIMEOUT_MS,
      })
      .catch(() => undefined);
    await page.waitForTimeout(SETTLE_MS);
    const bodyText = await page.evaluate(() => document.body.innerText.trim());
    expect.soft(bodyText.length, `${id}: page rendered blank`).toBeGreaterThan(20);

    // Path check: prove the intended route rendered, not a redirect to /sign-in
    // or an access-denied page (both would pass the render check above).
    const currentPath = new URL(page.url()).pathname;
    const expectedBase = expectedRoutePath(route);
    const pathOk = routePathMatches(route, currentPath);
    expect
      .soft(pathOk, `${id}: unexpected redirect (expected ≈ ${expectedBase}, got ${currentPath})`)
      .toBe(true);

    if (route.readyHeading) {
      await expect
        .soft(
          page.getByRole('heading', { name: route.readyHeading }),
          `${id}: canonical page landmark is missing`
        )
        .toBeVisible({ timeout: ROUTE_GOTO_TIMEOUT_MS });
    }

    // 375px overflow check — run before health assertion so mobile-viewport
    // errors are captured in health before we evaluate violations.
    if (route.check375) {
      // Restore whatever viewport this project runs at, not a hard-coded
      // desktop size: on `mobile-safari` a hard-coded 1280x720 would leak out
      // of this block and silently test every later route at desktop
      // dimensions, so the iPhone project would stop being an iPhone after its
      // first check375 route.
      const projectViewport = page.viewportSize() ?? { width: 1280, height: 720 };
      await page.setViewportSize({ width: 375, height: 667 });
      await page.waitForTimeout(300);
      const overflow = await measureHorizontalOverflow(page);
      expect
        .soft(
          overflow.overflowPx,
          `${id}: horizontal overflow at 375px; url=${overflow.url}; sources=${JSON.stringify(overflow.sources)}`
        )
        .toBe(0);
      await page.setViewportSize(projectViewport);
    }

    // Do not leave a route while one of its API reads is still in flight.
    // WebKit reports a cross-origin fetch canceled by the next navigation as a
    // page error ("due to access control checks"), even when the request is
    // healthy and completes with 200 if allowed to finish (MYK9-244).
    await assertAppApiRequestsSettled(page, pendingAppApiRequests, id);

    // Health checks (console errors, replication errors, owned 4xx/5xx).
    // Evaluated after the mobile resize so any mobile-triggered errors are included.
    const viols = violations(health);
    expect.soft(viols, `${id}: browser health violations`).toHaveLength(0);

    // Annotate result for report visibility.
    test.info().annotations.push({
      type: 'route',
      description: `${id} render=${bodyText.length}ch health=${viols.length > 0 ? viols.join('; ') : 'ok'}`,
    });
  }
}

// ── Role groups ───────────────────────────────────────────────────────────────

test.describe('Route health: public', () => {
  test('public routes render clean', async ({ page }) => {
    const pendingAppApiRequests = watchAppApiRequests(page);
    await sweepRoutes(page, 'public', PUBLIC_ROUTES, pendingAppApiRequests);
  });
});

test.describe('Route health: exhibitor', () => {
  test('exhibitor routes render clean', async ({ page }) => {
    const user = TEST_USERS.DEMO_EXHIBITOR;
    if (!user.email || !user.password) {
      test.info().annotations.push({
        type: 'note',
        description: 'Exhibitor credentials absent from environment',
      });
      test.skip(true, 'Exhibitor credentials absent — group skipped');
    }
    const pendingAppApiRequests = watchAppApiRequests(page);
    await signIn(page, user.email, user.password, '/exhibitor/entries');
    await sweepRoutes(page, 'exhibitor', EXHIBITOR_ROUTES, pendingAppApiRequests);
  });
});

test.describe('Route health: secretary', () => {
  test('secretary routes render clean', async ({ page }) => {
    const user = TEST_USERS.SECRETARY;
    if (!user.email || !user.password) {
      test.info().annotations.push({
        type: 'note',
        description: 'Secretary credentials absent from environment',
      });
      test.skip(true, 'Secretary credentials absent — group skipped');
    }
    const pendingAppApiRequests = watchAppApiRequests(page);
    await signIn(page, user.email, user.password, '/secretary/dashboard');
    await sweepRoutes(page, 'secretary', SECRETARY_ROUTES, pendingAppApiRequests);
  });
});

test.describe('Route health: judge', () => {
  test('judge routes render clean', async ({ page }) => {
    const user = TEST_USERS.JUDGE;
    if (!user.email || !user.password) {
      test.info().annotations.push({
        type: 'note',
        description: 'Judge credentials absent from environment',
      });
      test.skip(true, 'Judge credentials absent — group skipped');
    }
    const pendingAppApiRequests = watchAppApiRequests(page);
    await signIn(page, user.email, user.password, '/judge/dashboard');
    await sweepRoutes(page, 'judge', JUDGE_ROUTES, pendingAppApiRequests);
  });
});

test.describe('Route health: club-admin', () => {
  test('club-admin routes render clean', async ({ page }) => {
    const user = TEST_USERS.CLUB_ADMIN;
    if (!user.email || !user.password) {
      test.info().annotations.push({
        type: 'note',
        description: 'Club-admin credentials absent from environment',
      });
      test.skip(true, 'Club-admin credentials absent — group skipped');
    }
    const pendingAppApiRequests = watchAppApiRequests(page);
    await signIn(page, user.email, user.password, '/club-admin/members');
    await sweepRoutes(page, 'club-admin', CLUB_ADMIN_ROUTES, pendingAppApiRequests);
  });
});

test.describe('Route health: admin', () => {
  test('admin routes render clean', async ({ page }) => {
    const user = TEST_USERS.SITE_ADMIN;
    if (!user.email || !user.password) {
      test.info().annotations.push({
        type: 'note',
        description: 'Admin credentials absent from environment',
      });
      test.skip(true, 'Admin credentials absent — group skipped');
    }
    const pendingAppApiRequests = watchAppApiRequests(page);
    await signIn(page, user.email, user.password, '/admin/dashboard');
    await sweepRoutes(page, 'admin', ADMIN_ROUTES, pendingAppApiRequests);
  });
});
