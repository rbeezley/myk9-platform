import { expect, test, type Page } from '@playwright/test';
import { installSharedStagingWriteGuard } from '../helpers/sharedStagingWriteGuard';
import { signInAsSecretary } from '../helpers/testUsers';
import { LIVE_SECRETARY_SHOW_ID } from '../uat/shared/seededShows';

/**
 * MYK9-1989: on a laptop, Show Desk with a class selected leaves room for the class's entries,
 * measured as the secretary meets it: the class opened and NOT scrolled. The owner, on a MacBook:
 * the headers stacked above the entries filled about three quarters of the window. From lg the
 * class header is always compact (the name, its status and the buttons on one line; the settings
 * are in Edit class, MYK9-2379), the breadcrumb row folds away, "Needs attention" moves into the rail, the class panel starts beside the
 * schedule heading, and a locked check-in is a lock icon, so every row is one line tall.
 *
 * Without scrolling, the first entry row's top is in the upper half of a 1280x800 and a 1440x900
 * window and at least six whole rows are on screen (none under the panel's edge or the header).
 * The class name stays in view while the entries scroll. Phone and tablet keep the full card.
 *
 * Read-only. Seeded target only: it needs the demo seed's Heartland show with the load fixture's
 * entries in Exterior Excellent, and Container Novice A's three scored rows. It skips unless
 * MYK9_PLAYWRIGHT_REGRESSION_ENABLED=true (the isolated target), and the shared-staging write
 * guard stays installed as a second net.
 */

const CLASS_ID = 'dec1a55e-0000-0000-0000-000000000033';
const CLASS_NAME = 'Exterior Excellent';
// Three scored rows (Willow, Scout, Cooper) in the demo seed: their check-in is locked.
const SCORED_CLASS_ID = 'dec1a55e-0000-0000-0000-000000000031';
const SCORED_CLASS_NAME = 'Container Novice A';

test.skip(
  process.env.MYK9_PLAYWRIGHT_REGRESSION_ENABLED !== 'true',
  'Needs the seeded Heartland show (isolated target only)'
);

// A cold dev server compiles the show page on first load.
test.setTimeout(120_000);

async function openClass(
  page: Page,
  viewport: { width: number; height: number },
  classId = CLASS_ID,
  className = CLASS_NAME
) {
  await installSharedStagingWriteGuard(page);
  await page.setViewportSize(viewport);
  await signInAsSecretary(page, '/');
  await page.goto(`/shows/${LIVE_SECRETARY_SHOW_ID}?focus=${classId}`);
  await expect(page.getByRole('heading', { level: 2, name: className })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByTestId('class-entry-row').first()).toBeAttached({ timeout: 60_000 });
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
  test(`${viewport.width}x${viewport.height}: six entry rows show on load, no scrolling (MYK9-1989)`, async ({
    page,
  }) => {
    await openClass(page, viewport);
    await expect(page.locator('[data-cockpit-layout]')).toHaveAttribute(
      'data-cockpit-layout',
      'split'
    );
    // No scrolling: the page is where it loaded.
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

    // Nothing was deleted: the settings are one click away, in Edit class.
    await expect(page.getByRole('button', { name: 'Class settings' })).toHaveCount(0);
    await page.getByRole('button', { name: `Edit class ${CLASS_NAME}` }).click();
    const settings = page.getByTestId('class-live-settings');
    await expect(settings).toBeVisible();
    for (const label of ['Status', 'Judge', 'Scoring', 'Expected start']) {
      await expect(settings.getByText(label, { exact: true })).toBeVisible();
    }
  });
}

// MYK9-2379: the header is one line, so opening Requirements leaves the class panel its height.
test('1280x720: with Requirements open the scroll area keeps most of the window (MYK9-2379)', async ({
  page,
}) => {
  await openClass(page, { width: 1280, height: 720 });
  const header = page.getByTestId('focused-class-header');
  const headerBox = await header.boundingBox();
  expect(headerBox, 'the header has a box').not.toBeNull();
  // One line: the name, the status badge and the buttons.
  expect(headerBox?.height ?? Number.POSITIVE_INFINITY).toBeLessThan(80);

  const requirements = page.getByTestId('focused-class-requirements').getByRole('button').first();
  await requirements.click();
  await expect(requirements).toHaveAttribute('aria-expanded', 'true');
  await requirements.scrollIntoViewIfNeeded();

  const visible = await requirements.evaluate(el => {
    const block = document.querySelector<HTMLElement>('[data-testid="focused-class-header"]');
    // The class's own scroller (split) or the page, whichever scrolls it.
    let bottom = window.innerHeight;
    for (let node = el.parentElement; node; node = node.parentElement) {
      const overflow = getComputedStyle(node).overflowY;
      if ((overflow === 'auto' || overflow === 'scroll') && node.scrollHeight > node.clientHeight) {
        bottom = Math.min(bottom, node.getBoundingClientRect().bottom);
        break;
      }
    }
    return {
      height: bottom - (block?.getBoundingClientRect().bottom ?? 0),
      window: window.innerHeight,
    };
  });
  // Below the pinned header, at least half the window is scrollable class content.
  expect(visible.height).toBeGreaterThanOrEqual(visible.window * 0.5);
});

test('1280x800: the class name stays in view while the entries scroll (MYK9-1989)', async ({
  page,
}) => {
  await openClass(page, { width: 1280, height: 800 });
  const heading = page.getByRole('heading', { level: 2, name: CLASS_NAME });
  await page.getByTestId('class-entry-row').last().scrollIntoViewIfNeeded();
  await expect(page.getByTestId('class-entry-row').last()).toBeInViewport();
  await expect(heading).toBeInViewport();
});

test('1280x800: a locked check-in is a lock icon, so a scored row is one line tall (MYK9-1989)', async ({
  page,
}) => {
  await openClass(page, { width: 1280, height: 800 }, SCORED_CLASS_ID, SCORED_CLASS_NAME);
  const rows = page.getByTestId('class-entry-row');
  await expect(rows.first()).toBeAttached();
  // From lg the lock icon shows and the words are sr-only, so they take no line under the control.
  await expect(rows.first().getByTestId('locked-reason-icon')).toBeVisible();
  await expect(rows.first().getByText(/status is locked/)).toHaveCSS('position', 'absolute');
  const heights = await rows.evaluateAll(list =>
    list.map(row => row.getBoundingClientRect().height)
  );
  expect(heights.length).toBeGreaterThan(0);
  for (const height of heights) expect(height).toBeLessThan(70);
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
]) {
  test(`${viewport.width}x${viewport.height}: keeps the full class card, unpinned (MYK9-1989)`, async ({
    page,
  }) => {
    await openClass(page, viewport);
    const header = page.getByTestId('focused-class-header');
    await expect(header).toHaveCSS('position', 'static');
    await expect(header).not.toHaveAttribute('data-compact', 'true');
    // The settings are in Edit class, so the card has the button and no fields (MYK9-2379).
    await expect(page.getByRole('button', { name: `Edit class ${CLASS_NAME}` })).toBeVisible();
    await expect(page.getByText('Expected start', { exact: true })).toHaveCount(0);
  });
}
