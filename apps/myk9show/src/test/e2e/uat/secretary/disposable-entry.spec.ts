import { expect, test, type Locator, type Page } from '@playwright/test';
import { signInAsSecretary } from '../shared/auth';
import {
  createBrowserHealth,
  summarizeHealth,
  watchBrowserHealth,
  writeUatFinding,
  type BrowserHealth,
} from '../shared/artifacts';
import {
  cleanupSecretaryEntry,
  seedSecretaryEntry,
  type SecretaryUatSeed,
} from '../shared/secretaryData';

test.describe.configure({ mode: 'serial' });

const healthByTest = new Map<string, BrowserHealth>();
const seedByTest = new Map<string, SecretaryUatSeed>();

test.describe('Phase 1 UAT - Secretary disposable entry management', () => {
  test.setTimeout(90000);

  test.beforeEach(async ({ page }, testInfo) => {
    const health = createBrowserHealth();
    healthByTest.set(testInfo.testId, health);
    watchBrowserHealth(page, health);

    const seed = await seedSecretaryEntry(testInfo);
    seedByTest.set(testInfo.testId, seed);
    await signInAsSecretary(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    void page;
    const seed = seedByTest.get(testInfo.testId) ?? null;
    await cleanupSecretaryEntry(testInfo, seed);

    const health = healthByTest.get(testInfo.testId) ?? createBrowserHealth();
    const details = summarizeHealth(health);
    const status = testInfo.status === testInfo.expectedStatus ? 'passed' : 'failed';
    await writeUatFinding(testInfo, 'Secretary', 'disposable entry management', status, details);

    healthByTest.delete(testInfo.testId);
    seedByTest.delete(testInfo.testId);
  });

  test('secretary can find, assign armband, and accept a disposable entry', async ({
    page,
  }, testInfo) => {
    const seed = seedByTest.get(testInfo.testId)!;

    await page.goto(`/shows/${seed.showId}/entry-management`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Entry Management' })).toBeVisible({
      timeout: 15000,
    });

    await page.getByRole('searchbox', { name: 'Search all show registrations' }).fill(seed.dogName);
    const registrationRow = page
      .getByRole('list', { name: 'Registration work queue' })
      .getByRole('listitem')
      .filter({ hasText: seed.dogName });
    await expect(registrationRow).toBeVisible({ timeout: 10000 });
    await registrationRow.click();

    const entryCard = page
      .locator('section[aria-label^="Focused registration for"]')
      .filter({ hasText: seed.dogName });
    await expect(entryCard).toContainText(seed.className, { timeout: 10000 });

    await openArmbandDialog(page);
    const armbandDialog = page.getByRole('dialog', { name: 'Assign Armband' });
    await expect(armbandDialog).toBeVisible();
    await armbandDialog.getByLabel('Armband Number').fill(seed.armband);
    await armbandDialog.getByRole('button', { name: 'Assign' }).click();
    await expect(armbandDialog).not.toBeVisible({ timeout: 10000 });
    await expect(entryCard.getByText(seed.armband).first()).toBeVisible();

    const entryStatusButton = entryCard.getByRole('button', {
      name: new RegExp(
        `Change entry status for ${escapeRegExp(seed.dogName)} in ${escapeRegExp(seed.className)}`
      ),
    });
    await expect(entryStatusButton).toBeVisible({ timeout: 10000 });
    await entryCard.getByRole('button', { name: 'Accept', exact: true }).click();
    await expect(entryStatusButton).toContainText('Accepted', { timeout: 10000 });
  });
});

async function openArmbandDialog(page: Page) {
  const directAssign = page.getByRole('button', { name: 'Assign', exact: true }).last();
  if (await clickVisibleButton(directAssign, 10000)) {
    return;
  }

  await clickRowActionsWhenStable(
    page.getByRole('button', { name: 'Actions', exact: true }).first()
  );
  const assignItem = page.getByRole('menuitem', { name: /Assign armband|Change armband/i });
  await expect(assignItem.first()).toBeVisible({ timeout: 10000 });
  await assignItem.first().click();
}

async function clickVisibleButton(button: Locator, timeout: number) {
  try {
    await expect(button).toBeVisible({ timeout });
    await button.click();
    return true;
  } catch {
    return false;
  }
}

async function clickRowActionsWhenStable(rowActions: Locator) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await expect(rowActions).toBeVisible({ timeout: 10000 });

    try {
      await rowActions.click({ timeout: 3000 });
      return;
    } catch (error) {
      if (attempt === 3 || !isDetachedDuringClick(error)) {
        throw error;
      }
    }
  }
}

function isDetachedDuringClick(error: unknown) {
  return error instanceof Error && /detached from the DOM/i.test(error.message);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
