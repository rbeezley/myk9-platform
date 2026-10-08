import { expect, test, type Page } from '@playwright/test';
import { signInAsAdmin } from './helpers/testUsers';

const SEEDED_CLUB_ID = 'dededede-0000-0000-0000-000000000001';
const SEEDED_CLUB_NAME = 'Heartland Scent Work Club';
const MISSING_CLUB_ID = 'dededede-0000-0000-0000-000000000099';

function installRuntimeGuards(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  return errors;
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const metrics = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  expect(
    metrics.documentWidth,
    `horizontal overflow: ${JSON.stringify(metrics)}`
  ).toBeLessThanOrEqual(metrics.viewport);
}

/**
 * MYK9-952: the seeded clubs are demo fixtures (clubs.is_demo), so the GUEST
 * directory leaves them out while a direct link still opens them. The result
 * count is the positive control: it renders only once the server read has
 * landed, so the absence check below cannot pass on a page still loading.
 */
async function expectGuestDirectoryWithoutSeedClub(page: Page): Promise<void> {
  await page.goto('/clubs', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Clubs', level: 1 })).toBeVisible();
  await expect(page.getByText(/^Showing (all )?\d+( of \d+)? clubs?\.$/)).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText(SEEDED_CLUB_NAME, { exact: true })).toHaveCount(0);
}

test.describe('club surface integrity — read-only', () => {
  test('guest browse and valid/invalid detail routes reach terminal states', async ({ page }) => {
    const errors = installRuntimeGuards(page);
    await expectGuestDirectoryWithoutSeedClub(page);
    await expectNoHorizontalOverflow(page);

    await page.goto(`/clubs/${SEEDED_CLUB_ID}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: SEEDED_CLUB_NAME, level: 1 })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page).toHaveURL(`/clubs/${SEEDED_CLUB_ID}`);
    // Contact links live on About; the card has no ⋮ (CRUD standard decision 6).
    await expect(page.getByRole('button', { name: 'Club options' })).toHaveCount(0);

    await page.goto(`/clubs/${MISSING_CLUB_ID}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Club Not Found' })).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole('button', { name: 'Back to Clubs' }).click();
    await expect(page).toHaveURL('/clubs');
    await page.goBack();
    await expectNoHorizontalOverflow(page);
    expect(errors).toEqual([]);
  });

  test('authenticated profile tabs and statistic cards keep URL and panel state aligned', async ({
    page,
  }) => {
    const errors = installRuntimeGuards(page);
    await signInAsAdmin(page, `/clubs/${SEEDED_CLUB_ID}`);
    await expect(page.getByRole('heading', { name: SEEDED_CLUB_NAME, level: 1 })).toBeVisible({
      timeout: 30_000,
    });

    for (const tab of ['Past Shows', 'About', 'Members', 'Branding']) {
      await page.getByRole('tab', { name: tab }).click();
      const tabId = tab === 'Past Shows' ? 'past' : tab.toLowerCase();
      await expect(page).toHaveURL(new RegExp(`\\/clubs\\/[^?]+\\?tab=${tabId}$`));
      await expect(page.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true');
    }

    await page.getByRole('button', { name: /Total Shows/ }).click();
    await expect(page).toHaveURL(`/clubs/${SEEDED_CLUB_ID}`);
    await expect(page.getByRole('tab', { name: 'Upcoming Shows' })).toHaveAttribute(
      'aria-selected',
      'true'
    );

    const membersCard = page.getByRole('button', { name: /Active Members/ });
    await membersCard.press('Enter');
    await expect(page).toHaveURL(/\/clubs\/[^?]+\?tab=members$/);
    await expect(page.getByRole('tab', { name: 'Members' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expectNoHorizontalOverflow(page);
    expect(errors).toEqual([]);
  });

  test('My Club navigation never emits a dead link for the seeded account', async ({ page }) => {
    const errors = installRuntimeGuards(page);
    await signInAsAdmin(page, '/club-admin/members');
    await expect(
      page
        .getByRole('heading', { name: /Members$/, level: 1 })
        .or(page.getByText(/More than one club is linked|couldn.t verify your club access/i))
    ).toBeVisible({
      timeout: 30_000,
    });

    const profileLink = page.getByRole('link', { name: 'Club Profile' });
    if (await profileLink.isVisible().catch(() => false)) {
      await expect(profileLink).toHaveAttribute('href', `/clubs/${SEEDED_CLUB_ID}`);
      await profileLink.click();
      await expect(page).toHaveURL(`/clubs/${SEEDED_CLUB_ID}`);
    } else {
      await expect(
        page.getByText(/More than one club is linked|couldn.t verify your club access/i)
      ).toBeVisible();
    }
    await expectNoHorizontalOverflow(page);
    expect(errors).toEqual([]);
  });

  test('payment setup is actionable only after club context validation', async ({ page }) => {
    const errors = installRuntimeGuards(page);
    await signInAsAdmin(page, '/club-admin/payments');
    await expect(page.getByRole('heading', { name: 'Payments', level: 1 })).toBeVisible({
      timeout: 30_000,
    });

    const connectButton = page.getByRole('button', { name: 'Connect payment account' });
    if (await connectButton.isVisible().catch(() => false)) {
      await connectButton.click();
      await expect(page.getByText(/before you start/i)).toBeVisible();

      const notNow = page.getByRole('button', { name: 'Not now' });
      await notNow.focus();
      await notNow.press('Enter');
      await expect(page.getByText(/before you start/i)).not.toBeVisible();
      await expect(connectButton).toBeVisible();
    } else {
      await expect(
        page.getByText(/More than one club is linked|couldn.t verify your club access/i)
      ).toBeVisible();
    }
    await expectNoHorizontalOverflow(page);
    expect(errors).toEqual([]);
  });
});

test.describe('club surface integrity — 375px re-walk', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('guest browse and detail remain usable without horizontal overflow', async ({ page }) => {
    const errors = installRuntimeGuards(page);
    await expectGuestDirectoryWithoutSeedClub(page);
    await expectNoHorizontalOverflow(page);

    await page.goto(`/clubs/${SEEDED_CLUB_ID}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: SEEDED_CLUB_NAME, level: 1 })).toBeVisible({
      timeout: 30_000,
    });
    await expectNoHorizontalOverflow(page);
    expect(errors).toEqual([]);
  });
});
