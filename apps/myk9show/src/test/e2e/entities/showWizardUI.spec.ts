import { test, expect, type Page } from '@playwright/test';
import { signInAsSecretary } from '../helpers/testUsers';

/**
 * UI-driven e2e walk through the secretary's Show Creation Wizard.
 *
 * Strategy:
 *   - Sign in fresh per test (per-worker auth state isn't shared in Playwright).
 *   - Walk all four wizard steps end-to-end and create a real show.
 *   - The timezone-display regression suite is the guard for the
 *     /qa-feature walk that found `MAY 14` rendering for shows starting
 *     `2026-05-15`. Postgres `DATE` columns return `…T00:00:00+00:00`, which
 *     used to be parsed as local time in west-of-UTC zones and shifted the
 *     visible day forward (Apr 26, 2026).
 *
 * Auth: TEST_USERS.SECRETARY (`secretary@myk9t.com`, password in env).
 */

test.describe.configure({ mode: 'serial' });

// ---------------------------------------------------------------------------
// Step 1 — Show Details
// ---------------------------------------------------------------------------

test.describe('Show Wizard UI — Step 1 (secretary)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsSecretary(page);
  });

  test('opens at Step 1 with required-field labels and disabled Next', async ({ page }) => {
    await page.goto('/secretary/create-show/wizard');

    await expect(page.getByRole('heading', { name: 'Create New Show', level: 2 })).toBeVisible();
    await expect(page.getByText('Show Name *', { exact: true })).toBeVisible();
    await expect(page.getByText('Show Dates *', { exact: true })).toBeVisible();
    await expect(page.getByText('Entry Period *', { exact: true })).toBeVisible();
    await expect(page.getByText('Location *', { exact: true })).toBeVisible();
    await expect(page.getByText('Show Chairman *', { exact: true })).toBeVisible();
    // Show Secretary auto-set to the signed-in user.
    await expect(page.getByText('You', { exact: true })).toBeVisible();

    // Next is disabled until required fields are filled.
    await expect(page.getByRole('button', { name: /^Next$/ })).toBeDisabled();
  });

  test('clone affordance is present (Phase 1 — Quiet the Noise)', async ({ page }) => {
    await page.goto('/secretary/create-show/wizard');
    await expect(page.getByRole('button', { name: 'Select a past show to clone' })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Date timezone regression — the bug found by /qa-feature on 2026-04-26
// ---------------------------------------------------------------------------

test.describe('Show Wizard UI — Date timezone regression (secretary)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsSecretary(page);
  });

  test('Browse list date block matches the day in the descriptive label', async ({ page }) => {
    // INTENT (regression guard): the date "block" (DateCircle) used to parse
    // a UTC midnight timestamp like "2026-05-22T00:00:00+00:00" with the
    // bare `Date` constructor, which yielded May 21 in CDT — visibly off by
    // one from the descriptive label rendered next to it. Both must show
    // the same calendar day now.
    await page.goto('/shows');
    await page.getByRole('tab', { name: /^Browse All/ }).click();

    // Locate the first card that has a date label like "Jun 13–14".
    const card = page.locator('[role="group"][aria-label*="day show"]').first();
    await expect(card).toBeVisible();
    const ariaLabel = (await card.getAttribute('aria-label')) ?? '';
    // ariaLabel looks like "May 22, 2 day show" — pull "May 22".
    const blockLabel = ariaLabel.split(',')[0]?.trim();
    expect(blockLabel).toMatch(/^[A-Z][a-z]+ \d{1,2}$/);

    // The descriptive label is sibling text; format produced by
    // formatDateRange (e.g. "May 22–23"). Match the same month + start day.
    const monthShort = blockLabel!.split(' ')[0];
    const startDay = blockLabel!.split(' ')[1];
    const sameRow = card.locator('xpath=..').locator(`text=/${monthShort} ${startDay}/`);
    await expect(sameRow.first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Add Trials mode — the wizard reused for incremental updates
// ---------------------------------------------------------------------------

test.describe('Show Wizard UI — Add Trials mode (secretary)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsSecretary(page);
  });

  test('Add Trials lands on Step 2 with the show data preloaded', async ({ page }) => {
    await page.goto('/shows');
    await page.getByRole('tab', { name: /^Browse All/ }).click();
    // Open the first show, capture its id from the URL.
    await page.locator('h3').first().click();
    await page.waitForURL(/\/shows\/[a-f0-9-]{36}/);
    const showId = page.url().match(/\/shows\/([a-f0-9-]{36})/)![1]!;

    await page.goto(`/secretary/create-show/wizard?showId=${showId}&mode=add-trials`);

    await expect(page.getByRole('heading', { name: 'Add Trials', level: 2 })).toBeVisible();
    await expect(page.getByText('Step 2 of 4', { exact: true })).toBeVisible();
    // The "Add Trial" button is the affordance to start a new trial entry.
    await expect(page.getByRole('button', { name: /^Add Trial$/ }).first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Overlay stacking — the Show Dates modal vs. the venue map
// ---------------------------------------------------------------------------

type Clip = { x: number; y: number; width: number; height: number };

/**
 * Fraction of pixels in `clip` that differ between the two captures.
 *
 * Painting order is the thing under test, and hit-testing cannot see it:
 * Leaflet's panes are `pointer-events: none`, so `elementFromPoint` happily
 * reports the modal on top while the map is what the secretary actually sees.
 * Comparing rendered pixels is the only instrument that fails on the bug.
 */
async function changedFraction(page: Page, clip: Clip, before: Buffer): Promise<number> {
  const after = await page.screenshot({ clip });
  return page.evaluate(
    async ([a, b]: [string, string]) => {
      const load = async (data: string) => {
        const img = new Image();
        img.src = `data:image/png;base64,${data}`;
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d')!.drawImage(img, 0, 0);
        return canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
      };
      const [pa, pb] = [await load(a), await load(b)];
      if (pa.length !== pb.length) return 1;
      let changed = 0;
      for (let i = 0; i < pa.length; i += 4) {
        if (
          Math.abs(pa[i]! - pb[i]!) > 8 ||
          Math.abs(pa[i + 1]! - pb[i + 1]!) > 8 ||
          Math.abs(pa[i + 2]! - pb[i + 2]!) > 8
        ) {
          changed += 1;
        }
      }
      return changed / (pa.length / 4);
    },
    [before.toString('base64'), after.toString('base64')] as [string, string]
  );
}

test.describe('Show Wizard UI — overlay stacking (secretary)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsSecretary(page);
  });

  /**
   * leaflet.css stacks its panes at z-index 200–700 and its controls at
   * 800/1000. `.leaflet-container` is not a stacking context on its own, so
   * those used to land in the page root and outrank the Show Dates modal
   * (`z-50`): backdrop and calendar alike painted UNDER the venue map, leaving
   * a rectangle of map through the middle of the calendar. The guard is
   * `isolation: isolate` in features/maps/leaflet-stacking.css.
   */
  test('the Show Dates modal paints above the venue map', async ({ page }) => {
    await page.goto('/secretary/create-show/wizard');

    const map = page.locator('.leaflet-container');
    await expect(map).toBeVisible();
    await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible();

    // Settle the scroll BEFORE the baseline capture: clicking the trigger would
    // otherwise scroll it into view and move the map under the clip rect.
    const trigger = page.getByRole('button', { name: 'Show Dates *' });
    await trigger.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000); // tile fade-in

    const box = (await map.boundingBox())!;
    const visibleTop = Math.max(box.y, 0);
    const visibleHeight = Math.min(box.y + box.height, page.viewportSize()!.height) - visibleTop;
    // Positive control on the fixture itself: with no map on screen the
    // comparison below would be vacuous.
    expect(
      visibleHeight,
      'the venue map must be on screen for this to mean anything'
    ).toBeGreaterThan(60);

    const mapClip = { x: box.x, y: visibleTop, width: box.width, height: visibleHeight };
    // A strip the modal backdrop covers no matter how the map stacks — the
    // known-answer check that this instrument detects an overlay at all.
    const controlClip = { x: 4, y: visibleTop, width: 80, height: visibleHeight };

    const mapBefore = await page.screenshot({ clip: mapClip });
    const controlBefore = await page.screenshot({ clip: controlClip });

    await trigger.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.waitForTimeout(400);

    const boxAfter = (await map.boundingBox())!;
    expect(
      Math.abs(boxAfter.y - box.y),
      'the page scrolled; the clips no longer line up'
    ).toBeLessThan(2);

    const controlChanged = await changedFraction(page, controlClip, controlBefore);
    expect(
      controlChanged,
      'known-answer check: the backdrop must register as a change'
    ).toBeGreaterThan(0.5);

    const mapChanged = await changedFraction(page, mapClip, mapBefore);
    expect(mapChanged, 'the venue map is painting over the open Show Dates modal').toBeGreaterThan(
      0.5
    );
  });
});
