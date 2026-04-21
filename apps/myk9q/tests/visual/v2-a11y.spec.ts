import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// v2 Phase 2 axe-core WCAG 2.1 AA sweep.
//
// Scope: login public screen in three modes (light, dark, outdoor).
// Login is the Phase-2 surface that exercises design-tokens.css,
// mode-outdoor.css, and the refreshed passcode UI.
//
// Not covered yet (tracked as follow-ups):
//   - Landing page: has pre-existing AA contrast violations in
//     `.event-card` children (#3f3f46 on #18181b = 1.69:1) and
//     `.footer-copyright` (1.69:1) that predate Phase 2. The landing
//     page also hardcodes its own dark-landing theme and ignores
//     html.theme-light / html.mode-outdoor, so it is not a useful
//     surface for testing the new token system. Belongs to a
//     dedicated landing-page a11y sprint.
//   - Authenticated canonical screens from spec §10 (show detail,
//     class list, entry list, scoresheet, podium): deferred pending
//     a seed-data harness — see v2-smoke.spec.ts header.
//
// This spec establishes the plumbing (axe-core integration, mode
// toggling, violation filtering) so those surfaces can be slotted
// in by future work without adding dependencies.

type Mode = 'light' | 'dark' | 'outdoor';

async function applyMode(page: Page, mode: Mode) {
  await page.evaluate((m: Mode) => {
    const html = document.documentElement;
    html.classList.remove('theme-auto', 'theme-light', 'theme-dark', 'mode-outdoor');
    html.classList.add(m === 'dark' ? 'theme-dark' : 'theme-light');
    if (m === 'outdoor') html.classList.add('mode-outdoor');
  }, mode);
}

for (const mode of ['light', 'dark', 'outdoor'] as const) {
  test(`a11y sweep — login (${mode}) — WCAG 2.1 AA`, async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await applyMode(page, mode);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();

    // Separate contrast violations from structural ones so the output is readable.
    const contrastViolations = results.violations.filter(
      v => v.id === 'color-contrast' || v.id === 'color-contrast-enhanced'
    );
    const otherViolations = results.violations.filter(
      v => v.id !== 'color-contrast' && v.id !== 'color-contrast-enhanced'
    );

    expect(
      contrastViolations,
      `Contrast violations on login (${mode}): ${JSON.stringify(contrastViolations, null, 2)}`
    ).toEqual([]);

    // Log structural violations but do not fail — Phase 2 is a visual
    // refactor. Structural a11y work belongs to a dedicated sprint.
    if (otherViolations.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `[a11y][login][${mode}] non-contrast violations:`,
        otherViolations.map(v => v.id)
      );
    }
  });
}
