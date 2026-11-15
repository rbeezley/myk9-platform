import { expect, test, type Page } from '@playwright/test';
import { installSharedStagingWriteGuard } from '../helpers/sharedStagingWriteGuard';
import { signInAsSecretary } from '../helpers/testUsers';
import { LIVE_SECRETARY_SHOW_ID } from '../uat/shared/seededShows';

/**
 * MYK9-1989: on a laptop, Show Desk with a class selected leaves room for the class's entries.
 * The owner, on a MacBook: the headers stacked above the entries filled about three quarters of the
 * window, and scrolling showed one entry at a time. The pinned class header is compact from `lg`
 * (name and controls on one line, values on the next, settings behind Class settings), the folded
 * Shows button sits in the show header instead of on its own row, and the entries come before the
 * counts and the checklist while the header is pinned.
 *
 * Measured as the secretary works: the class picked, the show page scrolled so the class's panel
 * rides pinned under the show header and tabs. Then the first entry row's top is in the upper half
 * of a 1280x800 window and at least six whole rows are on screen (none under the panel's edge or the
 * pinned header), at 1280x800 and 1440x900.
 *
 * Read-only. Seeded target only: it needs the demo seed's Heartland show and its 66-entry
 * Exterior Excellent class, so it skips unless MYK9_PLAYWRIGHT_REGRESSION_ENABLED=true (the
 * isolated target), and the shared-staging write guard stays installed as a second net.
 */

const CLASS_ID = 'dec1a55e-0000-0000-0000-000000000033';
const CLASS_NAME = 'Exterior Excellent';

test.skip(
  process.env.MYK9_PLAYWRIGHT_REGRESSION_ENABLED !== 'true',
  'Needs the seeded Heartland show (isolated target only)'
);

// A cold dev server compiles the show page on first load.
test.setTimeout(120_000);

async function openClass(page: Page, viewport: { width: number; height: number }) {
  await installSharedStagingWriteGuard(page);
  await page.setViewportSize(viewport);
  await signInAsSecretary(page, '/');
  await page.goto(`/shows/${LIVE_SECRETARY_SHOW_ID}?focus=${CLASS_ID}`);
  await expect(page.getByRole('heading', { level: 2, name: CLASS_NAME })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByTestId('class-entry-row').first()).toBeAttached({ timeout: 60_000 });
}

/** Scroll the show page's own scroller (the pane, or the window) to its end, instantly. */
async function scrollShowPageToEnd(page: Page) {
  return page.evaluate(() => {
    const grid = document.querySelector('[data-cockpit-layout]');
    let scrolled = 0;
    for (let el = grid?.parentElement ?? null; el; el = el.parentElement) {
      const overflowY = getComputedStyle(el).overflowY;
      const scroller =
        el === document.documentElement || overflowY === 'auto' || overflowY === 'scroll';
      if (scroller && el.scrollHeight > el.clientHeight) {
        el.scrollTo({ top: el.scrollHeight, behavior: 'instant' });
        scrolled = Math.max(scrolled, el.scrollTop);
      }
    }
    return scrolled;
  });
}

/** Whole entry rows on screen: inside the window and every clipping box, and not covered. */
async function measureRows(page: Page) {
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll<HTMLElement>('[data-testid="class-entry-row"]')];
    const header = document.querySelector<HTMLElement>('[data-testid="focused-class-header"]');
    const headerBottom = header?.getBoundingClientRect().bottom ?? 0;
    const whole = rows.filter(row => {
      const box = row.getBoundingClientRect();
      if (box.top < headerBottom - 1 || box.bottom > window.innerHeight + 1) return false;
      for (let el = row.parentElement; el; el = el.parentElement) {
        if (getComputedStyle(el).overflowY === 'visible') continue;
        const clip = el.getBoundingClientRect();
        if (box.top < clip.top - 1 || box.bottom > clip.bottom + 1) return false;
      }
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return !!hit && row.contains(hit);
    });
    return {
      total: rows.length,
      whole: whole.length,
      headerPosition: header ? getComputedStyle(header).position : null,
      headerCompact: header?.dataset.compact === 'true',
    };
  });
}

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
]) {
  test(`${viewport.width}x${viewport.height}: six entry rows show under the pinned class header (MYK9-1989)`, async ({
    page,
  }) => {
    await openClass(page, viewport);
    await expect(page.locator('[data-cockpit-layout]')).toHaveAttribute(
      'data-cockpit-layout',
      'split'
    );
    // Positive control: the show page really scrolls, so the panel below is the pinned one.
    expect(await scrollShowPageToEnd(page)).toBeGreaterThan(100);

    const firstRow = page.getByTestId('class-entry-row').first();
    await expect(firstRow).toBeInViewport();
    const box = await firstRow.boundingBox();
    expect(box, 'the first entry row has a box').not.toBeNull();
    expect(box?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(viewport.height / 2);

    const rows = await measureRows(page);
    // Positive control: the class has far more entries than fit, so six is the window's answer.
    expect(rows.total).toBeGreaterThan(20);
    expect(rows.whole).toBeGreaterThanOrEqual(6);
    expect(rows.headerCompact).toBe(true);
    expect(rows.headerPosition).toBe('sticky');
    await expect(page.getByRole('heading', { level: 2, name: CLASS_NAME })).toBeInViewport();

    // Nothing was deleted: the settings are one click away.
    await page.getByRole('button', { name: 'Class settings' }).click();
    await expect(page.getByText('Expected start', { exact: true })).toBeVisible();
    await expect(page.getByText('Actual timing', { exact: true })).toBeVisible();
  });
}

test('390x844: the phone keeps the full class card, unpinned (MYK9-1989)', async ({ page }) => {
  await openClass(page, { width: 390, height: 844 });
  const header = page.getByTestId('focused-class-header');
  await expect(header).toHaveCSS('position', 'static');
  await expect(header).not.toHaveAttribute('data-compact', 'true');
  await expect(page.getByText('Expected start', { exact: true })).toBeAttached();
});
