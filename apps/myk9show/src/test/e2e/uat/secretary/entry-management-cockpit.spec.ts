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
    // One Filter button (docs/plan-entries-filter-button.md); the View: select is gone (MYK9-1594).
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
  await expect(page.getByRole('button', { name: /^Filter/ })).toBeVisible();
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
    // The checkbox sits in the queue card's header; rows arriving later move it.
    await expect(
      page.getByRole('list', { name: 'Entry form work queue' }).getByRole('listitem')
    ).not.toHaveCount(0);
    await expect(selectAll).toBeVisible();

    // Each corner of the 44x44 square centred on the checkbox must hit the
    // checkbox itself (its ::before is part of its hit area). ±21.5 sits inside a
    // 44px square but outside the old 42px one, so a revert to before:-inset-3.5
    // fails; ±23 lies outside 44 and must not hit it (a positive control). The
    // centre must hit it too, so a covered target reads differently from a small one.
    const corners = [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const;
    const offsets = [
      [0, 0],
      ...corners.flatMap(([sx, sy]) => [
        [sx * 21.5, sy * 21.5],
        [sx * 23, sy * 23],
      ]),
    ];
    // elementFromPoint only sees the viewport and answers null outside it.
    // scrollIntoViewIfNeeded stopped as soon as the checkbox was visible, which at
    // 390px left it on the last row and its lower probes below the fold
    // (MYK9-1464). So centre it, instantly (the app scrolls smoothly), and measure
    // and probe in the same call so nothing can move in between.
    const hits = await selectAll.evaluate((el, points) => {
      el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
      const box = el.getBoundingClientRect();
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      return points.map(([dx, dy]) => {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) {
          return `offscreen ${x},${y}`;
        }
        const hit = document.elementFromPoint(x, y);
        if (hit === el || el.contains(hit)) return 'checkbox';
        if (!hit) return 'nothing';
        // Name what took the point, so a failure says what covers the target.
        const r = hit.getBoundingClientRect();
        const cls = (hit.getAttribute('class') ?? '').slice(0, 120);
        return `${hit.tagName.toLowerCase()}.${cls} [${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}]`;
      });
    }, offsets);

    expect(hits[0], 'centre').toBe('checkbox');
    corners.forEach(([sx, sy], i) => {
      expect(hits[1 + i * 2], `corner ${sx},${sy} inside 44px`).toBe('checkbox');
      const outside = hits[2 + i * 2];
      expect(outside, `corner ${sx},${sy} outside 44px`).not.toBe('checkbox');
      expect(outside, `corner ${sx},${sy} outside 44px`).not.toMatch(/^(offscreen|nothing)/);
    });
  });
}

test('Entry Management deep-links to the existing Check-in desk', async ({ page }) => {
  await signInAsSecretary(page, `/shows/${LIVE_SECRETARY_SHOW_ID}/entries`);
  await page.getByTestId('header-actions-trigger').click();
  await page.getByTestId('header-action-show-tool-people-at-show').click();

  await expect(page).toHaveURL(
    new RegExp(`/shows/${LIVE_SECRETARY_SHOW_ID}\\?tool=people-at-show`)
  );
  const toolsDialog = page.getByRole('dialog', { name: 'People at show' });
  await expect(toolsDialog).toBeVisible();
});
