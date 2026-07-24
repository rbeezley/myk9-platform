/**
 * Dog workspace responsive/navigation regression (MYK9-74, task 3.9).
 *
 * Signs in as the canonical demo exhibitor and walks the consolidated Dog
 * Details workspace (Overview / Career / Records) at the four audited
 * viewport classes in light and dark modes, asserting: section nav visible
 * and operable, no horizontal overflow, aria-selected tracking, legacy tab
 * deep links resolving, and locked Premium views exposing an upgrade path.
 * Set EVIDENCE_DIR to also capture the screenshot matrix.
 */
import { test, expect, type Page } from '@playwright/test';
import { signInAsTestUser } from './helpers/testUsers';

const SHOTS = process.env.EVIDENCE_DIR ?? 'evidence-slice2';

const VIEWPORTS = [
  { name: 'phone-390x844', width: 390, height: 844 },
  { name: 'tablet-portrait-834x1112', width: 834, height: 1112 },
  { name: 'tablet-landscape-1112x834', width: 1112, height: 834 },
  { name: 'desktop-1280x800', width: 1280, height: 800 },
] as const;

// The secondary nav renders as a tablist (wide containers) or a labeled
// select/combobox (narrow) — accept either shape.
function careerNavOrSelect(page: Page) {
  return page
    .getByRole('tablist', { name: 'Career view' })
    .or(page.getByLabel('Career view'))
    .first();
}

function recordsNavOrSelect(page: Page) {
  return page
    .getByRole('tablist', { name: 'Records view' })
    .or(page.getByLabel('Records view'))
    .first();
}

async function assertNoHorizontalOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow, `${label}: horizontal overflow px`).toBeLessThanOrEqual(1);
}

async function openFirstOwnedDog(page: Page): Promise<void> {
  // Dog cards are links wrapping an h3; the SPA shell can lag past goto on a
  // cold dev server, so retry the load once (mirrors gotoSignIn's retry).
  const dogLink = page
    .getByRole('link')
    .filter({ has: page.getByRole('heading', { level: 3 }) })
    .first();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto('/dogs', { waitUntil: 'load' });
    try {
      await dogLink.waitFor({ state: 'visible', timeout: 20000 });
      break;
    } catch {
      if (attempt === 2) throw new Error('Dog list never rendered a dog card link');
    }
  }
  await dogLink.click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20000 });
}

test.describe('Slice 2 dog workspace evidence (demo exhibitor)', () => {
  test('captures viewport/theme matrix and navigation contracts', async ({ page }) => {
    test.setTimeout(300000);
    await signInAsTestUser(page, 'DEMO_EXHIBITOR');
    await openFirstOwnedDog(page);
    const dogUrl = new URL(page.url());
    const dogPath = dogUrl.pathname;

    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });

      for (const theme of ['light', 'dark'] as const) {
        // The header toggle flips the theme class trio; force via localStorage
        // + reload to make the state deterministic per iteration.
        await page.evaluate(t => localStorage.setItem('theme', t), theme);
        await page.goto(dogPath);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

        // Top-level nav present and unclipped.
        const sectionNav = page.getByRole('tablist', { name: 'Dog details section' });
        await expect(sectionNav).toBeVisible();
        await assertNoHorizontalOverflow(page, `${vp.name}/${theme}/overview`);
        await page.screenshot({
          path: `${SHOTS}/${vp.name}-${theme}-overview.png`,
          fullPage: false,
        });

        // Career — secondary nav operable; locked views show upgrade path.
        // Sections lazy-load: wait for the section's own secondary nav (its
        // chunk) before shooting, or the screenshot races the transition and
        // captures the previous section's still-visible UI.
        await sectionNav.getByRole('tab', { name: 'Career' }).click();
        await expect(page).toHaveURL(/section=career/);
        await expect(careerNavOrSelect(page)).toBeVisible({ timeout: 15000 });
        await expect(sectionNav.getByRole('tab', { name: 'Career' })).toHaveAttribute(
          'aria-selected',
          'true'
        );
        await assertNoHorizontalOverflow(page, `${vp.name}/${theme}/career`);
        await page.screenshot({ path: `${SHOTS}/${vp.name}-${theme}-career.png` });

        // Records — grouped/locked treatment.
        await sectionNav.getByRole('tab', { name: 'Records' }).click();
        await expect(page).toHaveURL(/section=records/);
        await expect(recordsNavOrSelect(page)).toBeVisible({ timeout: 15000 });
        await expect(sectionNav.getByRole('tab', { name: 'Records' })).toHaveAttribute(
          'aria-selected',
          'true'
        );
        await assertNoHorizontalOverflow(page, `${vp.name}/${theme}/records`);
        await page.screenshot({ path: `${SHOTS}/${vp.name}-${theme}-records.png` });
      }
    }

    // Legacy deep links resolve to the mapped section/view (light, desktop):
    // assert the SELECTED top-level tab and the rendered secondary view, not
    // merely the (unchanged) input URL.
    await page.setViewportSize({ width: 1280, height: 800 });
    for (const [legacy, topTab, secondaryNav] of [
      ['tab=title-progress', 'Career', 'Career view'],
      ['tab=pedigree', 'Records', 'Records view'],
      ['tab=registrations', 'Overview', null],
    ] as const) {
      await page.goto(`${dogPath}?${legacy}`);
      const nav = page.getByRole('tablist', { name: 'Dog details section' });
      await expect(nav).toBeVisible();
      await expect(nav.getByRole('tab', { name: topTab })).toHaveAttribute('aria-selected', 'true');
      if (secondaryNav) {
        await expect(
          page
            .getByRole('tablist', { name: secondaryNav })
            .or(page.getByLabel(secondaryNav))
            .first()
        ).toBeVisible({ timeout: 15000 });
      }
    }
    // Correct secondary view for a specific legacy id, and the locked
    // treatment: the demo exhibitor is a free account, so Records/Pedigree
    // must render the Premium lock with a working upgrade action.
    await page.goto(`${dogPath}?tab=pedigree`);
    await expect(page.getByText('Premium Feature', { exact: false }).first()).toBeVisible({
      timeout: 15000,
    });
    const upgrade = page.getByRole('button', { name: /Upgrade to Premium/i }).first();
    await expect(upgrade).toBeVisible();
    await upgrade.click();
    await expect(page).toHaveURL(/pricing-page/);
  });
});
