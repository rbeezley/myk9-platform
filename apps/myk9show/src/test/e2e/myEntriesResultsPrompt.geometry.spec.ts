import { test, expect } from '@playwright/test';
import { signInAsExhibitor } from './helpers/testUsers';
import { entriesAcrossThreeShows, installExhibitorFixture } from './helpers/exhibitorFixture';
import { fulfillRows } from './helpers/postgrestRoute';
import { expectNoHorizontalOverflow } from './helpers/horizontalOverflow';

/**
 * MYK9-2496: rendered geometry of the results prompt on /exhibitor/entries
 * (MYK9-2386). JSDOM cannot compute grid/flex widths, so the unit test beside
 * MyShowClassRow cannot see the failure this guards: the prompt living inside
 * the class row, squeezing the class name into a one-letter-per-line column.
 *
 * Hermetic: the fixture's completed show holds a placed, released result and
 * its profile row leaves `results_public` and the prompt answer unset, so the
 * prompt is due. The show-settings read is routed to no rows (defaults:
 * results not private) so shared staging cannot change the answer.
 */

const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1366, height: 768 },
] as const;

/** A readable class name needs at least this much width... */
const MIN_CLASS_NAME_WIDTH_PX = 80;
/** ...and wraps to at most two lines; one letter per line is far taller than wide. */
const MAX_CLASS_NAME_LINES = 2;

for (const viewport of VIEWPORTS) {
  test(`results prompt sits above the dog cards and keeps class names readable at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await installExhibitorFixture(page, { entries: entriesAcrossThreeShows() });
    await page.route('**/rest/v1/show_visibility_settings*', route => fulfillRows(route, []));
    await signInAsExhibitor(page, '/exhibitor/entries');

    // Reach the state a real exhibitor sees. The only placed result is on the
    // completed show, folded under "Past shows" while upcoming shows exist, and
    // the page holds its prompt back until that result's "New result" reveal has
    // been opened (the release key is then marked seen). Do both through the UI.
    await page.getByRole('button', { name: /^Past shows/ }).click();
    const newResult = page.getByRole('button', { name: 'New result' });
    await expect(newResult).toHaveCount(1, { timeout: 20000 });
    await newResult.click();
    const reveal = page.getByRole('dialog');
    await expect(reveal.getByRole('heading', { name: 'New result' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(reveal).toHaveCount(0);

    // The prompt renders once, for the show's one placed class.
    const prompt = page.getByTestId('results-public-prompt');
    await expect(prompt).toHaveCount(1, { timeout: 20000 });
    await expect(prompt).toBeVisible();

    // Not inside any class row.
    await expect(
      page.locator('.myk9-entries-class-row [data-testid="results-public-prompt"]')
    ).toHaveCount(0);

    // In the show block: above the dog list that follows it.
    const showBlock = prompt.locator('xpath=..');
    const dogList = showBlock.locator('> ul').first();
    await expect(dogList).toBeVisible();
    const promptBox = await prompt.boundingBox();
    const listBox = await dogList.boundingBox();
    expect(promptBox, 'prompt has a box').not.toBeNull();
    expect(listBox, 'dog list has a box').not.toBeNull();
    expect(promptBox!.y + promptBox!.height).toBeLessThanOrEqual(listBox!.y + 1);

    await expectNoHorizontalOverflow(page, `my entries at ${viewport.width}px`);

    // Class names stay readable: wide enough, and not stacked letter by letter.
    const classNames = showBlock.locator('.myk9-entries-class-name');
    await expect(classNames.first()).toBeVisible();
    const count = await classNames.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i += 1) {
      const el = classNames.nth(i);
      const box = await el.boundingBox();
      expect(box, `class name ${i} has a box`).not.toBeNull();
      const lineHeight = await el.evaluate(node => {
        const parsed = parseFloat(getComputedStyle(node).lineHeight);
        return Number.isFinite(parsed) ? parsed : parseFloat(getComputedStyle(node).fontSize) * 1.5;
      });
      const text = (await el.innerText()).trim();
      expect(box!.width, `"${text}" width`).toBeGreaterThanOrEqual(MIN_CLASS_NAME_WIDTH_PX);
      expect(box!.height, `"${text}" height`).toBeLessThanOrEqual(
        lineHeight * MAX_CLASS_NAME_LINES + 2
      );
    }
  });
}
