import { expect, test, type Page } from '@playwright/test';
import { signInAsAdmin } from './helpers/testUsers';

const SEEDED_CLUB_ID = 'dededede-0000-0000-0000-000000000001';
const SEEDED_CLUB_NAME = 'Heartland Scent Work Club';

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

async function readProfileRoster(page: Page): Promise<{ count: number; names: string[] }> {
  await page.goto(`/clubs/${SEEDED_CLUB_ID}?tab=members`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: SEEDED_CLUB_NAME, level: 1 })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole('tab', { name: 'Members' })).toHaveAttribute('aria-selected', 'true');

  const cardText = await page.getByRole('button', { name: /Active Members/ }).innerText();
  const count = Number(cardText.match(/\b\d+\b/)?.[0]);
  const names = (await page.locator('h4').allTextContents()).map(name => name.trim()).sort();

  expect(Number.isNaN(count), `profile count was not numeric: ${cardText}`).toBe(false);
  return { count, names };
}

async function readManagementRoster(page: Page): Promise<{ count: number; names: string[] }> {
  await page.goto('/club-admin/members', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /Members$/, level: 1 })).toBeVisible({
    timeout: 30_000,
  });

  const badge = page.getByText(/^\d+ active members?$/).first();
  const badgeText = await badge.innerText();
  const count = Number(badgeText.match(/\b\d+\b/)?.[0]);
  const names = (
    await page.locator('tbody tr').evaluateAll(rows =>
      rows
        .filter(row => row.querySelector('td:nth-child(4)')?.textContent?.trim() === 'Active')
        .map(row =>
          row
            .querySelector('td:first-child')
            ?.textContent?.replace(/Show Manager/g, '')
            .trim()
        )
        .filter((name): name is string => Boolean(name))
    )
  ).sort();

  expect(Number.isNaN(count), `management count was not numeric: ${badgeText}`).toBe(false);
  return { count, names };
}

async function runRosterAlignmentProof(page: Page): Promise<void> {
  const errors = installRuntimeGuards(page);
  await signInAsAdmin(page, `/clubs/${SEEDED_CLUB_ID}`);

  const profile = await readProfileRoster(page);
  await expectNoHorizontalOverflow(page);

  const management = await readManagementRoster(page);
  await expectNoHorizontalOverflow(page);

  expect(profile).toEqual(management);
  expect(errors).toEqual([]);
}

test.describe('club roster alignment — authenticated seeded club', () => {
  test('profile and management show the same active count and rows at desktop', async ({
    page,
  }) => {
    await runRosterAlignmentProof(page);
  });
});

test.describe('club roster alignment — authenticated seeded club at 390px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('profile and management show the same active count and rows on mobile', async ({ page }) => {
    await runRosterAlignmentProof(page);
  });
});
