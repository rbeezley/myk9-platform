import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { signInAsJudge, signInAsSecretary } from '../uat/shared/auth';
import { signInAsExhibitor } from '../helpers/testUsers';
import { openActionsMenu, chooseAction } from '../helpers/actionsMenu';

/**
 * MYK9-1227 (docs/plan-sidebar-browse-pane.md, phase 3): one Browse rail item for Shows, Dogs,
 * People and Clubs, opening the list used last, and a tablist above each list. MYK9-1228: Clubs
 * is a list with a detail pane from `lg`. Runs against the shared staging data; it only reads and
 * navigates (Add Club is opened and cancelled, never saved).
 */

const rail = (page: Page) => page.getByRole('navigation', { name: 'Main' });
const browse = (page: Page) => rail(page).getByRole('link', { name: 'Browse' });
const tablist = (page: Page) => page.getByRole('tablist', { name: 'Browse' });
const tab = (page: Page, name: string) => tablist(page).getByRole('tab', { name, exact: true });

async function expectNoSidewaysScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
}

async function expectSelected(page: Page, name: string) {
  await expect(tab(page, name)).toHaveAttribute('aria-selected', 'true', { timeout: 20_000 });
  await expect(browse(page)).toHaveAttribute('aria-current', 'page');
}

test.describe('Browse: one rail item and a tablist over the lists', () => {
  test('at 1440 a secretary switches lists by tab and key, Back returns, and Browse remembers', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInAsSecretary(page, '/secretary/dashboard');

    // One Browse item, labelled, in place of the four; the first time it opens Shows.
    await expect(browse(page)).toHaveText('Browse', { timeout: 20_000 });
    for (const name of ['Shows', 'Dogs', 'People', 'Clubs']) {
      await expect(rail(page).getByRole('link', { name, exact: true })).toHaveCount(0);
    }
    await expect(browse(page)).toHaveAttribute('href', '/shows');
    await browse(page).click();
    await expect(page).toHaveURL(/\/shows$/);

    // The Shows list beside Find Shows carries the tabs at its top.
    const showsList = page.getByRole('region', { name: 'Shows list' });
    await expect(showsList.getByRole('tablist', { name: 'Browse' })).toBeVisible({
      timeout: 20_000,
    });
    await expectSelected(page, 'Shows');
    expect(await tablist(page).getByRole('tab').allTextContents()).toEqual([
      'Shows',
      'Dogs',
      'People',
      'Clubs',
    ]);

    await tab(page, 'Dogs').click();
    await expect(page).toHaveURL(/\/dogs$/);
    await expectSelected(page, 'Dogs');

    // Arrow keys move along the tabs; the URL follows and focus stays on the tab.
    await tab(page, 'Dogs').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page).toHaveURL(/\/people$/);
    await expectSelected(page, 'People');
    await expect(tab(page, 'People')).toBeFocused();

    await page.goBack();
    await expect(page).toHaveURL(/\/dogs$/);
    await expectSelected(page, 'Dogs');

    // Clubs is a list with a detail pane: a club opens beside the list.
    await tab(page, 'Clubs').click();
    await expect(page).toHaveURL(/\/clubs$/);
    const clubsList = page.getByRole('region', { name: 'Clubs list' });
    await expect(clubsList.getByRole('link').first()).toBeVisible({ timeout: 20_000 });
    await clubsList.getByRole('link').first().click();
    await expect(page).toHaveURL(/\/clubs\/[\w-]+$/);
    await expect(page.getByRole('region', { name: 'Club details' })).toBeVisible();
    await expect(clubsList).toBeVisible();
    await tab(page, 'Clubs').click();
    await expect(page).toHaveURL(/\/clubs$/);
    await expectSelected(page, 'Clubs');
    await expectNoSidewaysScroll(page);

    // Elsewhere, Browse goes back to the list used last.
    await page.goto('/secretary/dashboard');
    await expect(browse(page)).toHaveAttribute('href', '/clubs', { timeout: 20_000 });
    await expect(browse(page)).not.toHaveAttribute('aria-current', 'page');
    await browse(page).click();
    await expect(page).toHaveURL(/\/clubs$/);
  });

  test('at 1440 a club opens beside the Clubs list, which keeps its search, export and Add Club', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInAsSecretary(page, '/clubs?search=Heartland');

    const clubsList = page.getByRole('region', { name: 'Clubs list' });
    const club = clubsList.getByRole('link', { name: /Heartland Scent Work Club/ });
    await expect(club).toBeVisible({ timeout: 20_000 });
    await club.click();
    await expect(page).toHaveURL(/\/clubs\/[\w-]+\?search=Heartland$/);
    const details = page.getByRole('region', { name: 'Club details' });
    await expect(
      details.getByRole('heading', { name: 'Heartland Scent Work Club' }).first()
    ).toBeVisible({ timeout: 20_000 });
    // The list kept its search: still filtered, still the same box value.
    await expect(clubsList.getByRole('searchbox').or(clubsList.getByRole('textbox'))).toHaveValue(
      'Heartland'
    );
    await expect(club).toHaveAttribute('aria-current', 'page');
    await expectNoSidewaysScroll(page);

    // Export CSV is still in the header Actions menu beside an open club.
    const menu = await openActionsMenu(page);
    await expect(menu.getByRole('menuitem', { name: 'Export CSV' })).toBeVisible();
    await page.keyboard.press('Escape');

    // Add always opens over the list, at every width; Cancel returns to that list.
    await chooseAction(page, 'Add Club');
    const panel = page.getByRole('dialog', { name: /Add Club/ });
    await expect(panel).toBeVisible();
    await expect(page).toHaveURL(/\/clubs$/);
    await panel.getByRole('button', { name: 'Cancel' }).click();
    await expect(panel).toBeHidden();
    await expect(page).toHaveURL(/\/clubs$/);
    await expect(page.getByText('Select a club to see its details')).toBeVisible();
  });

  for (const [path, noun] of [
    ['/dogs', 'Dog'],
    ['/people', 'Person'],
    ['/clubs', 'Club'],
  ] as const) {
    test(`at 1440 ${path} has no page-level Add ${noun} button; it is in the Actions menu (read-only)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await signInAsSecretary(page, path);
      await expect(page.getByRole('region', { name: /list$/ })).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole('button', { name: `Add ${noun}`, exact: true })).toHaveCount(0);
      const details = page.getByRole('region', { name: `${noun} details` });
      await expect(details.getByRole('navigation', { name: 'Breadcrumb' })).toBeVisible();
      await expect(page.locator('h1')).toHaveClass('sr-only');
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      // The list starts directly under the Browse tabs: search top within 40px of the tablist bottom.
      const tabsBottom =
        (await tablist(page).boundingBox())!.y + (await tablist(page).boundingBox())!.height;
      const searchTop = (await page
        .getByRole('region', { name: /list$/ })
        .getByRole('textbox')
        .first()
        .boundingBox())!.y;
      expect(searchTop - tabsBottom).toBeGreaterThanOrEqual(0);
      expect(searchTop - tabsBottom).toBeLessThanOrEqual(40);
      // No visible h1 on the empty list page (the one h1 is screen-reader only).
      expect(
        await page
          .locator('h1')
          .evaluateAll(
            nodes =>
              nodes.filter(
                n => n.getBoundingClientRect().width > 1 && getComputedStyle(n).clip === 'auto'
              ).length
          )
      ).toBe(0);
      // With a record open, its trail is inside the detail region too.
      await page.getByRole('region', { name: /list$/ }).getByRole('link').first().click();
      await expect(page).toHaveURL(new RegExp(`${path}/[\\w-]+`));
      await expect(details.getByRole('navigation', { name: 'Breadcrumb' })).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toHaveCount(1);
      await page.goto(path);
      await expect(details.getByRole('navigation', { name: 'Breadcrumb' })).toBeVisible();
      const menu = await openActionsMenu(page);
      await expect(menu.getByRole('menuitem', { name: /^Select/ })).toHaveCount(0);
      await expect(menu.getByRole('menuitem', { name: `Add ${noun}` })).toBeVisible();
      await page.keyboard.press('Escape');
    });
  }

  test('the tablist and its selected tab pass axe', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInAsSecretary(page, '/people');
    await expectSelected(page, 'People');

    const results = await new AxeBuilder({ page })
      .include('[role="tablist"]')
      .include('nav[aria-label="Main"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test('at 1024 the tabs sit above the list and the rail keeps Browse current', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await signInAsSecretary(page, '/dogs');

    await expectSelected(page, 'Dogs');
    await tab(page, 'People').click();
    await expect(page).toHaveURL(/\/people$/);
    await expectSelected(page, 'People');
    await expectNoSidewaysScroll(page);
  });

  test('at 390 the drawer lists the four lists by name and the tabs fit the screen', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signInAsSecretary(page, '/secretary/dashboard');

    await page.getByRole('button', { name: 'Open navigation' }).click();
    // The drawer's nav, found by its Browse heading (the drawer itself carries no dialog role).
    const drawer = page
      .getByRole('navigation')
      .filter({ has: page.getByRole('heading', { name: 'Browse', exact: true }) });
    for (const name of ['Shows', 'Dogs', 'People', 'Clubs']) {
      await expect(drawer.getByRole('link', { name, exact: true })).toBeVisible();
    }
    await drawer.getByRole('link', { name: 'Clubs', exact: true }).click();
    await expect(page).toHaveURL(/\/clubs$/);
    await expectSelectedTab(page, 'Clubs');
    await expectNoSidewaysScroll(page);

    // Each tab is at least the 44px touch floor and fits without scrolling sideways.
    for (const box of await tablist(page)
      .getByRole('tab')
      .evaluateAll(tabs =>
        tabs.map(element => element.getBoundingClientRect().toJSON() as DOMRect)
      )) {
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.right).toBeLessThanOrEqual(390);
    }

    // A club opens as its own page, with no tabs (a record, not a list).
    // Cards or table, whichever this device last chose: either way the club's name opens it.
    const firstClub = page
      .getByRole('main')
      .getByText('Heartland Scent Work Club', { exact: true })
      .first();
    await expect(firstClub).toBeVisible({ timeout: 20_000 });
    await firstClub.click();
    await expect(page).toHaveURL(/\/clubs\/[\w-]+$/);
    await expect(tablist(page)).toHaveCount(0);
    // Narrow screens keep the page hop: the club replaces the list.
    await expect(page.getByRole('region', { name: 'Clubs list' })).toHaveCount(0);
    // The show card's 44px Actions button must stay inside the card, not push the page sideways.
    await expect(page.getByRole('button', { name: /^Actions for / }).first()).toBeVisible({
      timeout: 20_000,
    });
    await expectNoSidewaysScroll(page);
    await page.setViewportSize({ width: 375, height: 844 });
    await chooseAction(page, 'Add Club');
    await expect(page).toHaveURL(/\/clubs$/);
    const panel = page.getByRole('dialog', { name: /Add Club/ });
    await expect(panel).toBeVisible();
    await panel.getByRole('button', { name: 'Cancel' }).click();
    await expect(page).toHaveURL(/\/clubs$/);
  });

  test('an exhibitor can reach Add Dog through Actions on the Dogs list', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 844 });
    await signInAsExhibitor(page, '/dogs');
    const menu = await openActionsMenu(page);
    await expect(menu.getByRole('menuitem', { name: 'Add Dog', exact: true })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: /^Select/ })).toHaveCount(0);
  });

  test('a judge browses Shows and their own dogs, and never People or Clubs', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInAsJudge(page, '/dogs');

    await expect(tab(page, 'My Dogs')).toHaveAttribute('aria-selected', 'true', {
      timeout: 20_000,
    });
    expect(await tablist(page).getByRole('tab').allTextContents()).toEqual(['Shows', 'My Dogs']);
    await expect(browse(page)).toHaveAttribute('aria-current', 'page');
  });
});

async function expectSelectedTab(page: Page, name: string) {
  await expect(tab(page, name)).toHaveAttribute('aria-selected', 'true', { timeout: 20_000 });
}
