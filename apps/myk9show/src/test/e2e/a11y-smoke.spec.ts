import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { TEST_USERS } from './helpers/testUsers';
import { signIn } from './uat/shared/auth';

/**
 * Accessibility smoke (Dynamic QA — Phase 6).
 *
 * Runs axe-core against:
 *   1. the top public landing pages — the surfaces every cold-start visitor
 *      hits before authenticating; and
 *   2. the authenticated role landings (secretary workbench, judge, admin) —
 *      the first screen each role sees.
 *
 * NOT covered: /at-show ringside. The base `/at-show` route (no `:showId`)
 * renders SmartSignInPage — the passcode/sign-in classifier — not a ringside
 * surface. The real ringside is `/at-show/:showId` behind a seeded show +
 * passcode/grant, so auditing `/at-show` would falsely claim show-day coverage.
 * Add it once a seeded show fixture exists (OPEN-TODOS: "Seed Phase 4 seam
 * fixtures").
 *
 * Gates on serious/critical violations only; moderate/minor are logged for
 * triage (file as OPEN-TODOS) rather than failing the build, per the phase plan.
 *
 * `color-contrast`:
 *   - PUBLIC pages: the theme-token contrast debt was fixed (light-mode
 *     `--muted-foreground` darkened from #8c8376 to #6b6358, clearing WCAG AA
 *     on every light surface). The rule is therefore ENFORCED on public pages.
 *   - AUTHENTICATED pages: still excluded via a clearly-commented baseline.
 *     The contrast fix only addressed the public/light surfaces; authed role
 *     landings render additional components (dashboards, data tables, ringside
 *     chrome) whose contrast has not yet been audited. Excluding it here keeps
 *     the authed smoke a real regression guard for every OTHER serious/critical
 *     rule until that audit lands. Tracked in OPEN-TODOS.
 */

// Authenticated role landings still carry un-audited color-contrast debt.
// Remove once authed surfaces are swept (Task 1 only cleared public pages).
const AUTHED_EXCLUDED_RULES = ['color-contrast'];

const PUBLIC_PAGES = [
  { name: 'Landing', path: '/' },
  { name: 'Browse Shows', path: '/shows' },
  { name: 'Sign In', path: '/sign-in' },
  { name: 'Sign Up', path: '/sign-up' },
  { name: 'Pricing', path: '/pricing-page' },
];

// Authenticated role landings. Each entry names the role whose credentials
// gate the page and the first route that role lands on after sign-in.
const AUTHED_PAGES = [
  { name: 'Secretary Dashboard', path: '/secretary/dashboard', user: TEST_USERS.SECRETARY },
  { name: 'Judge Dashboard', path: '/judge/dashboard', user: TEST_USERS.JUDGE },
  { name: 'Admin Dashboard', path: '/admin/dashboard', user: TEST_USERS.SITE_ADMIN },
] as const;

const BLOCKING_IMPACTS = ['serious', 'critical'];

/**
 * Wait for the SPA shell to render before scanning the DOM.
 *
 * The route's lazy chunk renders a `<Suspense>` "Loading page..." fallback
 * first; scanning during that window flags the fallback's transient muted
 * text (a fade-in state, not a real page violation). Wait for the fallback to
 * clear so axe sees the settled page, not the loading placeholder.
 */
async function waitForAppShell(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  await page.locator('#root').waitFor({ state: 'attached', timeout: 15000 });
  await expect(page.locator('#root')).not.toBeEmpty({ timeout: 15000 });
  await expect(page.getByText('Loading page...')).toHaveCount(0, { timeout: 15000 });
  // Let the landing's entrance fade-in animation finish and web fonts settle.
  // axe composites semi-transparent text against its backdrop, so scanning
  // mid-fade reports artificially low contrast ratios for fully-AA colors.
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await page.waitForTimeout(1500);
}

/**
 * Runs axe-core and throws on serious/critical violations, logging advisory
 * (moderate/minor) findings without failing. `excludedRules` is the baseline
 * of known-debt rules to disable for this surface.
 */
async function assertNoBlockingViolations(page: Page, name: string, excludedRules: string[]) {
  const builder = new AxeBuilder({ page }).withTags([
    'wcag2a',
    'wcag2aa',
    'wcag21a',
    'wcag21aa',
  ]);
  if (excludedRules.length > 0) {
    builder.disableRules(excludedRules);
  }
  const results = await builder.analyze();

  const blocking = results.violations.filter(v => BLOCKING_IMPACTS.includes(v.impact ?? ''));
  const advisory = results.violations.filter(v => !BLOCKING_IMPACTS.includes(v.impact ?? ''));

  if (advisory.length > 0) {
    console.log(
      `[a11y][${name}] ${advisory.length} moderate/minor (non-blocking): ` +
        advisory.map(v => `${v.id}(${v.impact})`).join(', ')
    );
  }

  if (blocking.length > 0) {
    const detail = blocking
      .map(v => `  - ${v.id} (${v.impact}): ${v.help} [${v.nodes.length} node(s)]\n    ${v.helpUrl}`)
      .join('\n');
    throw new Error(`${name} has ${blocking.length} serious/critical a11y violation(s):\n${detail}`);
  }

  expect(blocking, `${name} serious/critical a11y violations`).toHaveLength(0);
}

test.describe('a11y: public landing pages', () => {
  for (const { name, path } of PUBLIC_PAGES) {
    // color-contrast is ENFORCED on public pages (theme-token debt fixed).
    test(`${name} (${path}) has no serious/critical violations`, async ({ page }) => {
      await page.goto(path);
      await waitForAppShell(page);
      await assertNoBlockingViolations(page, `${name} (${path})`, []);
    });
  }
});

test.describe('a11y: authenticated role landings', () => {
  for (const { name, path, user } of AUTHED_PAGES) {
    test(`${name} (${path}) has no serious/critical violations`, async ({ page }) => {
      if (!user.email || !user.password) {
        test.skip(true, `${name}: credentials absent from environment — group skipped`);
      }
      await signIn(page, user.email, user.password, path);
      await page.goto(path);
      await waitForAppShell(page);
      await assertNoBlockingViolations(page, `${name} (${path})`, AUTHED_EXCLUDED_RULES);
    });
  }
});
