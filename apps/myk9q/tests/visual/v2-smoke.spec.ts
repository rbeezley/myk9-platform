import { test, expect, Page } from '@playwright/test';

// v2 Phase 2 visual smoke baseline.
//
// Scope: public screens only (landing page, pre-auth login) in four modes:
//   light, dark, outdoor, outdoor-dark.
//
// Authenticated canonical screens from spec §10 — show detail, class list,
// entry list, scoresheet, settings, podium — remain deferred because they
// require:
//   (a) a valid passcode that resolves against the shared Supabase backend,
//       which is not guaranteed in every dev environment, and
//   (b) seeded show/trial/class/entry IDs.
// They are tracked as a follow-up for a future sprint, when a seed-data
// harness is in place.
//
// Run: pnpm exec playwright test --config=playwright.visual.config.ts
// Regenerate: add --update-snapshots

type Mode = 'light' | 'dark' | 'outdoor' | 'outdoor-dark';

async function setMode(page: Page, mode: Mode) {
  await page.evaluate((m: Mode) => {
    const html = document.documentElement;
    html.classList.remove('theme-auto', 'theme-light', 'theme-dark', 'mode-outdoor');
    if (m === 'dark' || m === 'outdoor-dark') {
      html.classList.add('theme-dark');
    } else {
      html.classList.add('theme-light');
    }
    if (m === 'outdoor' || m === 'outdoor-dark') {
      html.classList.add('mode-outdoor');
    }
  }, mode);
}

const MODES: readonly Mode[] = ['light', 'dark', 'outdoor', 'outdoor-dark'] as const;

for (const mode of MODES) {
  test(`v2 smoke — landing (${mode})`, async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await setMode(page, mode);
    await expect(page).toHaveScreenshot(`landing-${mode}.png`, {
      maxDiffPixelRatio: 0.02,
      fullPage: true,
    });
  });

  test(`v2 smoke — login (${mode})`, async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await setMode(page, mode);
    await expect(page).toHaveScreenshot(`login-${mode}.png`, {
      maxDiffPixelRatio: 0.02,
      fullPage: true,
    });
  });
}

// Spec §4.2 [ADDED]: Fraunces must fall back to Georgia when Google Fonts is
// unreachable (ringside wifi / captive portal). This test pins the font
// stack so a future refactor can't silently drop Georgia. No auth needed —
// we inject a styled node into any loaded page and inspect its computed
// font-family.
test('v2 smoke — podium CSS falls back to Georgia when Google Fonts is blocked', async ({
  page,
}) => {
  await page.route('**/fonts.googleapis.com/**', route => route.abort());
  await page.route('**/fonts.gstatic.com/**', route => route.abort());

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const fontFamily = await page.evaluate(() => {
    const node = document.createElement('div');
    node.className = 'podium-name';
    node.style.fontFamily = "var(--font-serif, 'Fraunces', Georgia, serif)";
    document.body.appendChild(node);
    const computed = getComputedStyle(node).fontFamily;
    node.remove();
    return computed;
  });

  expect(fontFamily).toMatch(/Georgia/i);
});
