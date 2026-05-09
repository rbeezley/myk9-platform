import { expect, test } from '@playwright/test';
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

  test.afterEach(async (fixtures, testInfo) => {
    void fixtures;
    const seed = seedByTest.get(testInfo.testId) ?? null;
    await cleanupSecretaryEntry(testInfo, seed);

    const health = healthByTest.get(testInfo.testId) ?? createBrowserHealth();
    const details = summarizeHealth(health);
    const status = testInfo.status === testInfo.expectedStatus ? 'passed' : 'failed';
    await writeUatFinding(testInfo, 'Secretary', 'disposable entry management', status, details);

    healthByTest.delete(testInfo.testId);
    seedByTest.delete(testInfo.testId);
  });

  test('secretary can find, assign armband, accept, and check in a disposable entry', async ({
    page,
  }, testInfo) => {
    const seed = seedByTest.get(testInfo.testId)!;

    await page.goto(`/secretary/entries/${seed.showId}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Entry Management' })).toBeVisible({
      timeout: 15000,
    });

    await page.getByRole('textbox', { name: 'Search entries...' }).fill(seed.dogName);
    await expect(page.getByText(seed.dogName).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(seed.className).first()).toBeVisible();

    await page.getByRole('button', { name: 'Assign' }).first().click();
    const armbandDialog = page.getByRole('dialog', { name: 'Assign Armband' });
    await expect(armbandDialog).toBeVisible();
    await armbandDialog.getByLabel('Armband Number').fill(seed.armband);
    await armbandDialog.getByRole('button', { name: 'Assign' }).click();
    await expect(armbandDialog).not.toBeVisible({ timeout: 10000 });
    await expect(page.getByText(seed.armband).first()).toBeVisible();

    await page.getByRole('button', { name: /Pending/ }).first().click();
    await page.getByRole('menuitem', { name: 'Accepted', exact: true }).click();
    await expect(page.getByRole('button', { name: /Accepted/ }).first()).toBeVisible({
      timeout: 10000,
    });

    await page.getByRole('button', { name: /Not Checked In|No Status/ }).first().click();
    await page.getByRole('menuitem', { name: 'Checked-in' }).click();
    await expect(page.getByRole('button', { name: /Checked-in|Checked In/ }).first()).toBeVisible({
      timeout: 10000,
    });
  });
});
