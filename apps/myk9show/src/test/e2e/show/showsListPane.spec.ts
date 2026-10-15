import { expect, test, type Page } from '@playwright/test';
import { signInAsSecretary } from '../uat/shared/auth';

/**
 * MYK9-1213 (docs/plan-sidebar-browse-pane.md, phase 2): the Shows list beside the show.
 * From a 1280px window the show sits in the pane beside the list; between 1024 and 1279 the list
 * folds away while a show is open; under 1024 a tap is a page hop. Runs against the shared
 * staging data as the secretary, who manages several shows past and upcoming.
 */

const SHOW_URL = /\/shows\/([a-f0-9-]{36})$/;

const showsList = (page: Page) => page.getByRole('region', { name: 'Shows list' });

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

    // Today's show is one click away in the list, and its cockpit keeps the split.
    await openFirstShow(page, 'Today');
    await expect(page.getByTestId('cockpit-split-focus')).toBeVisible({ timeout: 20_000 });
  });

  test('at 1280 the show sits beside the list with the cockpit split', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signInAsSecretary(page, '/shows');
    await openFirstShow(page, 'Today');

    await expect(showsList(page)).toBeVisible();
    await expect(page.getByTestId('cockpit-split-focus')).toBeVisible({ timeout: 20_000 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
  });

  test('at 1024 the list folds away while a show is open; "Shows" brings it back', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await signInAsSecretary(page, '/shows');
    await page.evaluate(() => window.localStorage.removeItem('view-pref-shows-pane'));
    await openFirstShow(page, 'Upcoming');

    await expect(showsList(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Shows', exact: true }).click();
    await expect(showsList(page)).toBeVisible();
    await page.getByRole('button', { name: 'Hide shows list' }).click();
    await expect(showsList(page)).toHaveCount(0);
  });

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
