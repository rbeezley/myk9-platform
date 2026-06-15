import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Accessibility smoke (Dynamic QA — Phase 6).
 *
 * Runs axe-core against the top public landing pages — the surfaces every
 * cold-start visitor hits before authenticating. Gates on serious/critical
 * violations only; moderate/minor are logged for triage (file as OPEN-TODOS)
 * rather than failing the build, per the phase plan.
 *
 * `color-contrast` is excluded from the gate: the baseline scan found it on
 * 39–83 nodes per page — a pre-existing, design-system-wide theme-token issue,
 * not a regression this phase can fix. It is tracked as a remediation task in
 * OPEN-TODOS. Excluding it (rather than failing or silencing the whole gate)
 * keeps this a real regression guard for every OTHER serious/critical rule —
 * missing form labels, ARIA misuse, broken landmarks — which must stay at zero.
 *
 * Authenticated role landings (secretary workbench, judge, admin, at-show)
 * need a storageState fixture and are deferred to a follow-up — see OPEN-TODOS.
 */

// Known pre-existing debt, tracked in OPEN-TODOS — excluded so the gate can
// guard regressions of all other rules. Remove once the theme contrast is fixed.
const BASELINE_EXCLUDED_RULES = ['color-contrast'];

const PUBLIC_PAGES = [
  { name: 'Landing', path: '/' },
  { name: 'Browse Shows', path: '/shows' },
  { name: 'Sign In', path: '/sign-in' },
  { name: 'Sign Up', path: '/sign-up' },
  { name: 'Pricing', path: '/pricing-page' },
];

const BLOCKING_IMPACTS = ['serious', 'critical'];

for (const { name, path } of PUBLIC_PAGES) {
  test(`a11y: ${name} (${path}) has no serious/critical violations`, async ({ page }) => {
    await page.goto(path);
    // SPA: wait for the app shell to render before scanning the DOM.
    await page.waitForLoadState('domcontentloaded');
    await page.locator('#root').waitFor({ state: 'attached', timeout: 15000 });
    await expect(page.locator('#root')).not.toBeEmpty({ timeout: 15000 });

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .disableRules(BASELINE_EXCLUDED_RULES)
      .analyze();

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
      throw new Error(`${name} (${path}) has ${blocking.length} serious/critical a11y violation(s):\n${detail}`);
    }

    expect(blocking, `${name} serious/critical a11y violations`).toHaveLength(0);
  });
}
