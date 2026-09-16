import { expect, test, type Locator, type Page } from '@playwright/test';
import { signInAsAdmin } from './helpers/testUsers';

/**
 * MYK9-592 round 2 (P2): `w-10` / `min-w-10` / `max-w-10` on the dogs-table
 * select column, and the matching `left-10` offset on Name, are a CSS
 * HYPOTHESIS about `table-layout: auto` — jsdom performs no layout at all, so
 * nothing in the unit suite (`DogsTableView.test.tsx`,
 * `columnLayoutClasses.test.ts`) can prove the column actually renders at a
 * fixed 40px, that Name pins immediately beside it rather than sliding under
 * it, or that the enlarged tap-target pseudo-element is actually
 * hit-testable rather than occluded by a higher, opaque neighbor. This is
 * that real-browser evidence: rendered geometry at the 768px tablet viewport
 * the issue targets, before and after a horizontal scroll — the exact
 * scenario P2a/P2b broke.
 *
 * Read-only: signs in as the shared e2e admin, opens /dogs, measures, and
 * leaves nothing selected or scrolled behind (selection and scroll position
 * are client-side state, not persisted).
 */
const TABLET_VIEWPORT = { width: 768, height: 1024 };
const LEAD_WIDTH_PX = 40; // STICKY_LEFT_LEAD_WIDTH_CLASS = 'w-10' = 2.5rem
const WIDTH_TOLERANCE_PX = 1;

function cellWidth(cell: Locator): Promise<number> {
  return cell.evaluate(el => el.getBoundingClientRect().width);
}

function expectNear(actual: number, expected: number, tolerance: number, label: string) {
  expect(
    actual,
    `${label}: expected ~${expected}px (±${tolerance}), got ${actual}px`
  ).toBeGreaterThanOrEqual(expected - tolerance);
  expect(
    actual,
    `${label}: expected ~${expected}px (±${tolerance}), got ${actual}px`
  ).toBeLessThanOrEqual(expected + tolerance);
}

/**
 * AC2 evidence: the enlarged tap-target pseudo-element must be the thing a
 * real pointer actually hits 8px past the checkbox's own edge — not occluded
 * by a higher-z, opaque neighbor cell painting on top of it (the P2a bug).
 */
async function assertPointHitsCheckbox(page: Page, checkbox: Locator, label: string) {
  const box = await checkbox.boundingBox();
  expect(box, `${label} has no bounding box (not visible?)`).not.toBeNull();
  if (!box) return;
  const point = { x: box.x + box.width + 8, y: box.y + box.height / 2 };
  const hit = await checkbox.evaluate((el, pt) => {
    const target = document.elementFromPoint(pt.x, pt.y);
    return Boolean(target && (target === el || el.contains(target)));
  }, point);
  expect(
    hit,
    `${label}: elementFromPoint(${point.x}, ${point.y}) did not resolve inside the checkbox — ` +
      'something else is painted on top of the enlarged tap target'
  ).toBe(true);
}

test.describe('dogs table pinned select column (MYK9-592)', () => {
  test('select column renders at a fixed 40px, Name pins beside it under scroll, and the tap target is hit-testable', async ({
    page,
  }) => {
    await page.setViewportSize(TABLET_VIEWPORT);
    await signInAsAdmin(page);
    await page.goto('/dogs', { waitUntil: 'domcontentloaded' });

    const headerCheckbox = page.getByRole('checkbox', { name: 'Select all dogs' });
    await expect(headerCheckbox).toBeVisible({ timeout: 30_000 });
    const rowCheckbox = page.getByRole('checkbox', { name: /^Select (?!all dogs)/ }).first();
    await expect(rowCheckbox).toBeVisible({ timeout: 30_000 });

    const selectHeaderCell = headerCheckbox.locator('xpath=ancestor::th[1]');
    const selectBodyCell = rowCheckbox.locator('xpath=ancestor::td[1]');

    // Both header and body select cells render at exactly 40px, not merely
    // "at least" — table-layout: auto could otherwise widen the column with
    // any surplus space, silently breaking the hardcoded left-10 offset Name
    // relies on.
    expectNear(
      await cellWidth(selectHeaderCell),
      LEAD_WIDTH_PX,
      WIDTH_TOLERANCE_PX,
      'header select cell width'
    );
    expectNear(
      await cellWidth(selectBodyCell),
      LEAD_WIDTH_PX,
      WIDTH_TOLERANCE_PX,
      'body select cell width'
    );

    await assertPointHitsCheckbox(page, headerCheckbox, 'header checkbox');
    await assertPointHitsCheckbox(page, rowCheckbox, 'row checkbox');

    // Scroll the table's OWN horizontal scroll region (not the page) and
    // re-measure. Name must still sit immediately beside the pinned select
    // column, not slide underneath or away from it (the P2b bug).
    const scrollRegion = page.getByRole('region', { name: 'Dogs table' });
    const overflow = await scrollRegion.evaluate(el => el.scrollWidth - el.clientWidth);
    expect(
      overflow,
      'the table must actually overflow horizontally at 768px for this scroll assertion to test anything'
    ).toBeGreaterThan(0);

    await scrollRegion.evaluate(el => {
      el.scrollLeft = 200;
    });
    // Let sticky positioning settle a frame before reading geometry.
    await page.waitForTimeout(50);

    const nameHeaderCell = page.locator('thead th').nth(1);
    const nameBodyCell = page.locator('tbody tr').first().locator('td').nth(1);

    for (const [label, nameCell, selectCell] of [
      ['header', nameHeaderCell, selectHeaderCell],
      ['body', nameBodyCell, selectBodyCell],
    ] as const) {
      const computedLeftPx = await nameCell.evaluate(el => parseFloat(getComputedStyle(el).left));
      expectNear(computedLeftPx, LEAD_WIDTH_PX, WIDTH_TOLERANCE_PX, `${label} Name computed left`);

      const [nameRectX, selectRectRight] = await Promise.all([
        nameCell.evaluate(el => el.getBoundingClientRect().x),
        selectCell.evaluate(el => el.getBoundingClientRect().right),
      ]);
      expectNear(
        nameRectX,
        selectRectRight,
        WIDTH_TOLERANCE_PX,
        `${label} Name.x vs select.right after scroll`
      );
    }

    // Re-run the hit-test after scrolling too — this is the exact scenario
    // P2b broke (Name sliding on top of the checkbox at a scroll offset).
    await assertPointHitsCheckbox(page, headerCheckbox, 'header checkbox (scrolled)');
    await assertPointHitsCheckbox(page, rowCheckbox, 'row checkbox (scrolled)');

    // Leave the shared account's scroll position as found.
    await scrollRegion.evaluate(el => {
      el.scrollLeft = 0;
    });
  });
});
