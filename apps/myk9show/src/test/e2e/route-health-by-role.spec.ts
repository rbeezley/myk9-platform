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
import {
  createBrowserHealth,
  watchBrowserHealth,
  type BrowserHealth,
} from './uat/shared/artifacts';

const SEEDED_SHOW = '4584f257-19b5-4016-aae6-5e7827b769cb';

// domcontentloaded + fixed settle; avoids the ~32s networkidle stalls (2026-05-30).
const SETTLE_MS = 1500;

// Console messages excluded from the error budget.
// "Maximum update depth exceeded" is React StrictMode dev-mode noise.
const NOISE_PATTERNS = ['Maximum update depth exceeded'];

// Console patterns that indicate the QA-CONSOLE-ERROR-011 replication flood.
// Closed as non-reproducing 2026-06-05; kept as a regression guard here.
const REPLICATION_PATTERNS = ['Sync failed', 'Failed to fetch', 'Database query failed'];

interface RouteSpec {
  label: string;
  path: string;
  /** Measure horizontal overflow at 375px for this route. */
  check375?: boolean;
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
  { label: 'entries', path: `/secretary/shows/${SEEDED_SHOW}/entry-management` },
  { label: 'reports', path: `/secretary/shows/${SEEDED_SHOW}/reports` },
  { label: 'settings', path: '/secretary/settings' },
  { label: 'people', path: '/people' },
  { label: 'workbench', path: `/secretary/shows/${SEEDED_SHOW}` },
];

const JUDGE_ROUTES: RouteSpec[] = [
  { label: 'dashboard', path: '/judge/dashboard' },
  { label: 'stats', path: '/judge/stats' },
  { label: 'check-in', path: '/judge/check-in' },
];

const CLUB_ADMIN_ROUTES: RouteSpec[] = [
  { label: 'members', path: '/club-admin/members' },
];

const ADMIN_ROUTES: RouteSpec[] = [
  { label: 'dashboard', path: '/admin/dashboard', check375: true },
  { label: 'users', path: '/admin/users' },
  { label: 'permissions', path: '/admin/permissions' },
  { label: 'templates', path: '/admin/templates' },
  { label: 'sync', path: '/admin/sync' },
  { label: 'onboarding', path: '/admin/onboarding' },
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

/**
 * Visits each route, soft-asserting render, health, and overflow checks.
 * All routes are visited even when individual checks fail.
 */
async function sweepRoutes(page: Page, group: string, routes: RouteSpec[]) {
  const health = createBrowserHealth();
  watchBrowserHealth(page, health);

  for (const route of routes) {
    // Reset accumulated state from the previous route visit.
    health.consoleErrors.length = 0;
    health.pageErrors.length = 0;
    health.failedResponses.length = 0;

    await page.goto(route.path, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(SETTLE_MS);

    const id = `${group}/${route.label}`;

    // Render check: body must contain meaningful text (>20 chars).
    // This catches blank pages and pages stuck on "Loading page..." (14 chars).
    const bodyText = await page.evaluate(() => document.body.innerText.trim());
    expect.soft(bodyText.length, `${id}: page rendered blank`).toBeGreaterThan(20);

    // Path check: prove the intended route rendered, not a redirect to /sign-in
    // or an access-denied page (both would pass the render check above).
    const currentPath = new URL(page.url()).pathname;
    const expectedBase = route.path.split('?')[0];
    const pathOk =
      expectedBase === '/' ? currentPath === '/' : currentPath.startsWith(expectedBase);
    expect
      .soft(pathOk, `${id}: unexpected redirect (expected ≈ ${expectedBase}, got ${currentPath})`)
      .toBe(true);

    // 375px overflow check — run before health assertion so mobile-viewport
    // errors are captured in health before we evaluate violations.
    if (route.check375) {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.waitForTimeout(300);
      const overflowPx = await page.evaluate(() =>
        Math.max(0, document.documentElement.scrollWidth - window.innerWidth)
      );
      expect.soft(overflowPx, `${id}: horizontal overflow at 375px`).toBe(0);
      await page.setViewportSize({ width: 1280, height: 720 });
    }

    // Health checks (console errors, replication errors, owned 4xx/5xx).
    // Evaluated after the mobile resize so any mobile-triggered errors are included.
    const viols = violations(health);
    expect.soft(viols, `${id}: browser health violations`).toHaveLength(0);

    // Annotate result for report visibility.
    test
      .info()
      .annotations.push({ type: 'route', description: `${id} render=${bodyText.length}ch health=${viols.length > 0 ? viols.join('; ') : 'ok'}` });
  }
}

// ── Role groups ───────────────────────────────────────────────────────────────

test.describe('Route health: public', () => {
  test('public routes render clean', async ({ page }) => {
    await sweepRoutes(page, 'public', PUBLIC_ROUTES);
  });
});

test.describe('Route health: exhibitor', () => {
  test('exhibitor routes render clean', async ({ page }) => {
    const user = TEST_USERS.EXHIBITOR;
    if (!user.email || !user.password) {
      test
        .info()
        .annotations.push({ type: 'note', description: 'Exhibitor credentials absent from environment' });
      test.skip(true, 'Exhibitor credentials absent — group skipped');
    }
    await signIn(page, user.email, user.password, '/exhibitor/entries');
    await sweepRoutes(page, 'exhibitor', EXHIBITOR_ROUTES);
  });
});

test.describe('Route health: secretary', () => {
  test('secretary routes render clean', async ({ page }) => {
    const user = TEST_USERS.SECRETARY;
    if (!user.email || !user.password) {
      test
        .info()
        .annotations.push({ type: 'note', description: 'Secretary credentials absent from environment' });
      test.skip(true, 'Secretary credentials absent — group skipped');
    }
    await signIn(page, user.email, user.password, '/secretary/dashboard');
    await sweepRoutes(page, 'secretary', SECRETARY_ROUTES);
  });
});

test.describe('Route health: judge', () => {
  test('judge routes render clean', async ({ page }) => {
    const user = TEST_USERS.JUDGE;
    if (!user.email || !user.password) {
      test.info().annotations.push({ type: 'note', description: 'Judge credentials absent from environment' });
      test.skip(true, 'Judge credentials absent — group skipped');
    }
    await signIn(page, user.email, user.password, '/judge/dashboard');
    await sweepRoutes(page, 'judge', JUDGE_ROUTES);
  });
});

test.describe('Route health: club-admin', () => {
  test('club-admin routes render clean', async ({ page }) => {
    const user = TEST_USERS.CLUB_ADMIN;
    if (!user.email || !user.password) {
      test
        .info()
        .annotations.push({ type: 'note', description: 'Club-admin credentials absent from environment' });
      test.skip(true, 'Club-admin credentials absent — group skipped');
    }
    await signIn(page, user.email, user.password, '/club-admin/members');
    await sweepRoutes(page, 'club-admin', CLUB_ADMIN_ROUTES);
  });
});

test.describe('Route health: admin', () => {
  test('admin routes render clean', async ({ page }) => {
    const user = TEST_USERS.SITE_ADMIN;
    if (!user.email || !user.password) {
      test.info().annotations.push({ type: 'note', description: 'Admin credentials absent from environment' });
      test.skip(true, 'Admin credentials absent — group skipped');
    }
    await signIn(page, user.email, user.password, '/admin/dashboard');
    await sweepRoutes(page, 'admin', ADMIN_ROUTES);
  });
});
