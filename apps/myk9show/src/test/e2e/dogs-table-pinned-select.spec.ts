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
 * At the round-3 head the table happened to overflow horizontally at 768px
 * by coincidence — the buggy checkbox wrapper (round-4 review) was itself
 * widening the select column past its intended 40px. With that bug fixed,
 * the visible columns (select + Name + Owner + Status; Breed/Sex are
 * `lg`-hidden) legitimately FIT within 768px and there is nothing to
 * scroll. The P2b invariant — Name must stay glued beside Select under any
 * horizontal scroll, never slide over it — still needs proof independent of
 * whether the content happens to overflow today, so this test forces
 * overflow with a temporary, test-only width constraint on the table's own
 * scroll region when none occurs naturally (see `forceHorizontalOverflow`).
 * That changes nothing about the columns' actual CSS; it only guarantees a
 * `scrollLeft` has somewhere to go.
 *
 * Read-only: signs in as the shared e2e admin, opens /dogs, measures, and
 * leaves nothing selected, scrolled, or resized behind (selection, scroll
 * position, and the forced width are all client-side state, never
 * persisted).
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
 *
 * Polled: the header checkbox can be briefly not visible while the table
 * re-renders (a null bounding box in Regression run 36090720412, MYK9-751),
 * which says nothing about stacking. A real occlusion never clears on its own,
 * so it still fails when the poll times out.
 */
async function assertPointHitsCheckbox(page: Page, checkbox: Locator, label: string) {
  await expect
    .poll(
      async () => {
        const box = await checkbox.boundingBox();
        if (!box) return 'no bounding box (not visible)';
        const point = { x: box.x + box.width + 8, y: box.y + box.height / 2 };
        const hit = await checkbox.evaluate((el, pt) => {
          const target = document.elementFromPoint(pt.x, pt.y);
          return Boolean(target && (target === el || el.contains(target)));
        }, point);
        return hit
          ? 'hit'
          : `elementFromPoint(${point.x}, ${point.y}) did not resolve inside the checkbox — ` +
              'something else is painted on top of the enlarged tap target';
      },
      { message: label, timeout: 5_000 }
    )
    .toBe('hit');
}

/** MYK9-751: the checkbox sits in the middle of its 40px cell, not off to one side. */
async function expectCheckboxCentred(checkbox: Locator, cell: Locator, label: string) {
  const [box, cellBox] = await Promise.all([checkbox.boundingBox(), cell.boundingBox()]);
  expect(box && cellBox, `${label}: no bounding box`).toBeTruthy();
  const offset = box!.x + box!.width / 2 - (cellBox!.x + cellBox!.width / 2);
  expect(Math.abs(offset), `${label} is ${offset}px off the cell's centre`).toBeLessThanOrEqual(1);
}

/**
 * Guarantees `scrollRegion.scrollLeft = N` has somewhere real to go, without
 * touching any column's own CSS. If the table already overflows naturally,
 * this is a no-op. Otherwise it shrinks the scroll region's own rendered
 * width (not the columns inside it) just enough to force `scrollWidth >
 * clientWidth` — the region's content, and therefore the pinning CSS under
 * test, is completely unaffected; only how much of it is visible at once
 * changes.
 */
async function forceHorizontalOverflow(scrollRegion: Locator): Promise<void> {
  const overflow = await scrollRegion.evaluate(el => el.scrollWidth - el.clientWidth);
  if (overflow > 0) return;
  // Narrow enough to overflow whatever the dog names are: a fixed 120px cut
  // stayed wider than the table's min-content with short names, so the
  // overflow assertion failed before the pinning was exercised (MYK9-751).
  await scrollRegion.evaluate(el => {
    const target = Math.max(Math.min(el.clientWidth - 120, 240), 160);
    el.style.width = `${target}px`;
    el.style.maxWidth = `${target}px`;
  });
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

    await expectCheckboxCentred(headerCheckbox, selectHeaderCell, 'header checkbox');
    await expectCheckboxCentred(rowCheckbox, selectBodyCell, 'row checkbox');
    await assertPointHitsCheckbox(page, headerCheckbox, 'header checkbox');
    await assertPointHitsCheckbox(page, rowCheckbox, 'row checkbox');

    // Scroll the table's OWN horizontal scroll region (not the page) and
    // re-measure. Name must still sit immediately beside the pinned select
    // column, not slide underneath or away from it (the P2b bug).
    const scrollRegion = page.getByRole('region', { name: 'Dogs table' });
    await forceHorizontalOverflow(scrollRegion);
    const overflow = await scrollRegion.evaluate(el => el.scrollWidth - el.clientWidth);
    expect(
      overflow,
      'expected scrollWidth > clientWidth on the table scroll region for this scroll assertion to test anything'
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

    // Leave the shared account's scroll position (and any forced width) as
    // found — both are inline style / scroll state on this page instance
    // only, never persisted, but tidy up anyway.
    await scrollRegion.evaluate(el => {
      el.scrollLeft = 0;
      el.style.width = '';
      el.style.maxWidth = '';
    });
  });
});
