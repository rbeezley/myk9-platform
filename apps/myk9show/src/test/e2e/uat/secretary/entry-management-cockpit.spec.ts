import { expect, test } from '@playwright/test';
import { signInAsSecretary } from '../shared/auth';
import { LIVE_SECRETARY_SHOW_ID } from '../shared/seededShows';
import {
  PHONE_AT_150_PERCENT_ZOOM,
  expectNoHorizontalScroll,
} from '../../shared/horizontalOverflow';

const SEARCH_LABEL = 'Search exhibitor, dog, handler, armband, confirmation, class…';

test('registration focus remains clear across desktop, history, and narrow layouts', async ({
  page,
}) => {
  await signInAsSecretary(page, `/shows/${LIVE_SECRETARY_SHOW_ID}/entries`);
  await expect(
    page.getByRole('textbox', {
      name: 'Search exhibitor, dog, handler, armband, confirmation, class…',
    })
  ).toBeVisible({
    timeout: 30_000,
  });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByText('Entry form', { exact: true })).toBeVisible();

  const queueRows = page.getByRole('list', { name: 'Entry form work queue' }).getByRole('listitem');
  await expect(queueRows).not.toHaveCount(0);
  await expect(queueRows.first()).toHaveAttribute('aria-current', 'true');
  const offlineSearchTerm = (await queueRows.first().getAttribute('aria-label'))?.split(',')[0];
  const firstRegistrationSelection = queueRows.first().getByRole('checkbox');
  await firstRegistrationSelection.check();
  await expect(firstRegistrationSelection).toBeChecked();
  await queueRows.nth(1).click();
  await expect(queueRows.nth(1)).toHaveAttribute('aria-current', 'true');

  await page.goBack();
  await expect(queueRows.first()).toHaveAttribute('aria-current', 'true');
  await expect(firstRegistrationSelection).toBeChecked();
  await queueRows.nth(1).click();

  await page.setViewportSize({ width: 900, height: 1000 });
  await expect(page.getByRole('button', { name: 'Back to list' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to list' }).click();
  await expect(page.getByRole('list', { name: 'Entry form work queue' })).toBeVisible();
  // Focus returns to the row's action — the row's only button — rather than to
  // the `listitem`, which carries no interactive role.
  await expect(queueRows.nth(1).getByRole('button')).toBeFocused();

  await page.context().setOffline(true);
  try {
    // Below 1024px the search is an icon named after its field; tapping it opens the field.
    await page.getByRole('button', { name: SEARCH_LABEL }).click();
    await page
      .getByRole('textbox', { name: SEARCH_LABEL })
      .fill(offlineSearchTerm ?? 'registration');
    await expect(queueRows).not.toHaveCount(0);
    // One Show: menu and one Filter button (docs/plan-entries-filter-button.md).
    await expect(page.getByRole('button', { name: /^Show:/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Filter/ })).toBeVisible();
    await expect(page.getByText(/Search covers the whole show/i)).toBeVisible();
  } finally {
    await page.context().setOffline(false);
  }
});

test('the registration queue keeps every row inside a 768px tablet viewport (MYK9-57)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await signInAsSecretary(page, `/shows/${LIVE_SECRETARY_SHOW_ID}/entries`);
  // Below 1024px the search is a 44px icon until tapped.
  await expect(page.getByRole('button', { name: SEARCH_LABEL })).toBeVisible({ timeout: 30_000 });

  const queue = page.getByRole('list', { name: 'Entry form work queue' });
  const rows = queue.getByRole('listitem');
  await expect(rows).not.toHaveCount(0);
  await expect(rows.first().getByRole('button')).toBeVisible();

  // The queue card is `overflow-hidden` with no scrollable ancestor, so
  // anything past the right edge is unreachable rather than merely off-screen.
  const clipped = await queue.evaluate(node => {
    const viewportWidth = document.documentElement.clientWidth;
    return [...node.querySelectorAll('*')].filter(
      element => element.getBoundingClientRect().right > viewportWidth + 1
    ).length;
  });
  expect(clipped).toBe(0);

  const hiddenPerRow = await rows.evaluateAll(nodes =>
    nodes.map(node => node.scrollWidth - node.clientWidth)
  );
  expect(hiddenPerRow.every(hidden => hidden <= 1)).toBe(true);
});

// MYK9-643: at 150% zoom on a phone the "Missing info" queue button
// would not shrink and pushed the page sideways.
test('Entry Management does not scroll sideways at 150% zoom on a phone', async ({ page }) => {
  await page.setViewportSize(PHONE_AT_150_PERCENT_ZOOM);
  await signInAsSecretary(page, `/shows/${LIVE_SECRETARY_SHOW_ID}/entries`);
  await expect(page.getByRole('button', { name: SEARCH_LABEL })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: /^Show:/ })).toBeVisible();
  await expectNoHorizontalScroll(page, 'Entry Management');
});

// MYK9-643: pagination measured 32px tall and the select-all checkbox's
// before:-inset-3.5 hit area computed to 42x42 (the 1px border is outside the
// pseudo-element's padding-box containing block).
for (const viewport of [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
]) {
  test(`Entry forms pagination and select-all meet the 44px floor at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await signInAsSecretary(page, `/shows/${LIVE_SECRETARY_SHOW_ID}/entries`);
    await expect(page.getByRole('button', { name: SEARCH_LABEL })).toBeVisible({ timeout: 30_000 });

    const pagination = page.getByRole('navigation', { name: 'Entry form pagination' });
    for (const name of ['Previous', 'Next']) {
      const box = await pagination.getByRole('button', { name, exact: true }).boundingBox();
      expect(box, `${name} must be rendered`).not.toBeNull();
      const height = Math.round(box!.height);
      expect(height, `${name} is ${Math.round(box!.width)}x${height}`).toBeGreaterThanOrEqual(44);
    }

    const selectAll = page.getByRole('checkbox', {
      name: /^Select all (on page|entry forms on this page)$/,
    });
    // elementFromPoint only sees the viewport, and boundingBox does not scroll.
    await selectAll.scrollIntoViewIfNeeded();
    const box = await selectAll.boundingBox();
    expect(box, 'select-all checkbox must be rendered').not.toBeNull();
    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;
    const hitsCheckbox = (dx: number, dy: number) =>
      selectAll.evaluate(
        (el, point) => {
          const hit = document.elementFromPoint(point.x, point.y);
          return hit === el || el.contains(hit);
        },
        { x: cx + dx, y: cy + dy }
      );
    // Each corner of the 44x44 square centred on the checkbox must hit the
    // checkbox itself (its ::before is part of its hit area). ±21.5 sits inside a
    // 44px square but outside the old 42px one, so a revert to before:-inset-3.5
    // fails; ±23 lies outside 44 and must not hit it (a positive control).
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const) {
      expect(await hitsCheckbox(sx * 21.5, sy * 21.5), `corner ${sx},${sy} inside 44px`).toBe(true);
      expect(await hitsCheckbox(sx * 23, sy * 23), `corner ${sx},${sy} outside 44px`).toBe(false);
    }
  });
}

test('Entry Management deep-links to the existing Check-in desk', async ({ page }) => {
  await signInAsSecretary(page, `/shows/${LIVE_SECRETARY_SHOW_ID}/entries`);
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('link', { name: 'Open Check-in desk' }).click();

  await expect(page).toHaveURL(
    new RegExp(`/shows/${LIVE_SECRETARY_SHOW_ID}\\?tool=people-at-show`)
  );
  const toolsDialog = page.getByRole('dialog', { name: 'People at show' });
  await expect(toolsDialog).toBeVisible();
});
