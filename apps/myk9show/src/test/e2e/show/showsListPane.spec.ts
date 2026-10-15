import { expect, test, type Page } from '@playwright/test';
import { signInAsSecretary } from '../uat/shared/auth';

/**
 * MYK9-1213 (docs/plan-sidebar-browse-pane.md, phase 2): the Shows list beside the show.
 * The cockpit splits on its own width (868px, `cockpitSplit.ts`), and the list stays beside an
 * open show only where the cockpit beside it still splits (`showsPaneFold.ts`): open at 1440,
 * folded at 1280 and 1024; under 1024 a tap is a page hop. Runs against the shared staging data
 * as the secretary, who manages several shows past and upcoming.
 */

const SHOW_URL = /\/shows\/([a-f0-9-]{36})$/;

const showsList = (page: Page) => page.getByRole('region', { name: 'Shows list' });

/** The cockpit's measured geometry: its width, its layout, and the focused class column. */
async function cockpitGeometry(page: Page) {
  const grid = page.locator('[data-cockpit-layout]');
  await expect(grid).toBeVisible({ timeout: 20_000 });
  return grid.evaluate(element => ({
    width: element.getBoundingClientRect().width,
    layout: element.getAttribute('data-cockpit-layout'),
    focus:
      element.querySelector('[data-testid="cockpit-split-focus"]')?.getBoundingClientRect().width ??
      null,
  }));
}

/** The cockpit splits exactly when it is 868px or wider, and then gives the focus 360px or more. */
async function expectCockpitFollowsItsWidth(page: Page, expected: 'split' | 'stacked') {
  const geometry = await cockpitGeometry(page);
  expect(geometry.layout, `cockpit ${geometry.width}px wide`).toBe(
    geometry.width >= 868 ? 'split' : 'stacked'
  );
  expect(geometry.layout).toBe(expected);
  if (expected === 'split') expect(geometry.focus).toBeGreaterThanOrEqual(360);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
}

async function openFirstShow(page: Page, group: 'Today' | 'Upcoming' | 'Past'): Promise<string> {
  const row = showsList(page)
    .getByRole('list', { name: `${group} shows` })
    .getByRole('link')
    .first();
  await expect(row, `Expected the secretary to have a show in ${group}`).toBeVisible({
    timeout: 20_000,
  });
  await row.click();
  await expect(page).toHaveURL(SHOW_URL);
  return page.url().match(SHOW_URL)![1]!;
}

test.describe('Shows list with a detail pane', () => {
  test('at 1440 a secretary finds a past show from /shows; the cockpit still splits', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInAsSecretary(page, '/shows');

    await expect(showsList(page)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('region', { name: 'Find Shows' })).toBeVisible();
    // The rail no longer carries a single "Today's show" / "Next show" link.
    await expect(
      page.getByRole('link', { name: /^(Today's show|Next show|Draft show):/ })
    ).toHaveCount(0);

    const pastId = await openFirstShow(page, 'Past');
    await expect(showsList(page)).toBeVisible();
    await expect(showsList(page).locator(`a[href="/shows/${pastId}"]`)).toHaveAttribute(
      'aria-current',
      'page'
    );
    await expect(page.getByRole('region', { name: 'Show', exact: true })).toBeVisible();

    // Today's show is one click away in the list, and its cockpit keeps the split beside it.
    await openFirstShow(page, 'Today');
    await expectCockpitFollowsItsWidth(page, 'split');
  });

  // The cockpit decides from the width it is given: full page at 1024 and 1280 it splits; beside
  // the list there (the viewer's own choice) it stacks rather than squeezing its schedule.
  for (const width of [1024, 1280]) {
    test(`at ${width} the list folds from an open show, whose cockpit splits full width`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await signInAsSecretary(page, '/shows');
      await page.evaluate(() => window.localStorage.removeItem('view-pref-shows-pane'));
      await openFirstShow(page, 'Today');

      await expect(showsList(page)).toHaveCount(0);
      await expectCockpitFollowsItsWidth(page, 'split');

      await page.getByRole('button', { name: 'Shows', exact: true }).click();
      await expect(showsList(page)).toBeVisible();
      await expectCockpitFollowsItsWidth(page, 'stacked');
      await page.getByRole('button', { name: 'Hide shows list' }).click();
      await expect(showsList(page)).toHaveCount(0);
    });
  }

  test('with the network off, a show opened earlier is still listed and opens', async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInAsSecretary(page, '/shows');
    const todayId = await openFirstShow(page, 'Today');
    await openFirstShow(page, 'Upcoming');

    await context.setOffline(true);
    try {
      const row = showsList(page).locator(`a[href="/shows/${todayId}"]`);
      await expect(row).toBeVisible();
      await row.click();
      await expect(page).toHaveURL(new RegExp(`/shows/${todayId}$`));
      await expect(page.getByRole('region', { name: 'Show', exact: true })).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
  });

  test('at 800 there is no list pane and a show tap is a full page hop', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 1000 });
    await signInAsSecretary(page, '/shows');

    await expect(page.getByRole('heading', { name: 'Find Shows', level: 1 })).toBeVisible({
      timeout: 20_000,
    });
    await expect(showsList(page)).toHaveCount(0);
    // Managing opens in the table view; Browse All lists the shows as linked cards.
    await page.getByRole('tab', { name: /^Browse All/ }).click();
    const card = page.locator('main a[href^="/shows/"]').first();
    await expect(card).toBeVisible({ timeout: 20_000 });
    await card.click();
    await expect(page).toHaveURL(/\/shows\/[a-f0-9-]{36}/);
    await expect(showsList(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Shows', exact: true })).toHaveCount(0);
  });
});
