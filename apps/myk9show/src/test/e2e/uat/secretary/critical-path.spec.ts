import { expect, test, type Page } from '@playwright/test';
import { signInAsSecretary } from '../shared/auth';
import {
  type BrowserHealth,
  createBrowserHealth,
  summarizeHealth,
  watchBrowserHealth,
  writeUatFinding,
} from '../shared/artifacts';

test.describe.configure({ mode: 'serial' });

const SHOW_ID = '4584f257-19b5-4016-aae6-5e7827b769cb';
const healthByTest = new Map<string, BrowserHealth>();

test.describe('Phase 1 UAT - Secretary critical path', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    const health = createBrowserHealth();
    healthByTest.set(testInfo.testId, health);
    watchBrowserHealth(page, health);
    await signInAsSecretary(page);
  });

  test.afterEach(async ({}, testInfo) => {
    const health = healthByTest.get(testInfo.testId) ?? createBrowserHealth();
    const details = summarizeHealth(health);
    const status = testInfo.status === testInfo.expectedStatus ? 'passed' : 'failed';
    await writeUatFinding(testInfo, 'Secretary', 'critical path', status, details);
    healthByTest.delete(testInfo.testId);
  });

  test('dashboard shows secretary command center and show creation affordance', async ({ page }) => {
    await page.goto('/secretary/dashboard', { waitUntil: 'networkidle' });

    await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole('button', { name: 'New Show' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Tasks/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Messages/ })).toBeVisible();
  });

  test('show creation wizard starts with clear required fields and disabled next state', async ({
    page,
  }) => {
    await page.goto('/secretary/create-show/wizard', { waitUntil: 'networkidle' });

    await expect(page.getByRole('heading', { name: 'Create New Show', level: 2 })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText('Show Name *', { exact: true })).toBeVisible();
    await expect(page.getByText('Show Dates *', { exact: true })).toBeVisible();
    await expect(page.getByText('Entry Period *', { exact: true })).toBeVisible();
    await expect(page.getByText('Location *', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Select a past show to clone' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Next$/ })).toBeDisabled();
  });

  test('mail-in registration can find a non-owned dog and reach class selection', async ({ page }) => {
    await page.goto(`/secretary/register/${SHOW_ID}`, { waitUntil: 'networkidle' });

    await expect(page.getByRole('heading', { name: 'Register for Show' })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText(/Step 1 of 5/).first()).toBeVisible();

    const search = page.getByPlaceholder(/Search all dogs/i);
    await expect(search).toBeVisible();
    await search.fill('Bravo');
    await waitForDogSearch(page, 'bravo');

    await expect(page.getByText(/^\d+ dogs?/)).toBeVisible();
    await expect(page.getByText(/No dogs match your search/i)).not.toBeVisible();

    await page.getByText('Bravo', { exact: true }).last().click();
    await expect(page.getByText(/1 selected/)).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: /^Next/ })).toBeEnabled();

    await page.getByRole('button', { name: /^Next/ }).click();
    await expect(page.getByRole('heading', { name: 'Select Classes' })).toBeVisible({
      timeout: 10000,
    });
  });

  test('entry management exposes review, waitlist, armband, and export controls', async ({ page }) => {
    await page.goto(`/secretary/entries/${SHOW_ID}`, { waitUntil: 'networkidle' });

    await expect(page.getByRole('heading', { name: 'Entry Management' })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole('button', { name: 'New Entry' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export CSV' })).toBeVisible();
    await expect(page.getByText('Total Entries', { exact: true })).toBeVisible();
    await expect(page.getByText('Need review', { exact: true })).toBeVisible();
    await expect(page.getByText('Confirmed entries', { exact: true })).toBeVisible();

    await expect(page.getByRole('textbox', { name: 'Search entries...' })).toBeVisible();
    await expect(page.getByRole('tab', { name: /^All \(\d+\)$/ })).toBeVisible({
      timeout: 10000,
    });

    await page.getByRole('tab', { name: 'Waitlist', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Waitlist Management' })).toBeVisible();
    await page.getByRole('tab', { name: 'Entries', exact: true }).click();

    const assignButton = page.getByRole('button', { name: 'Assign' }).first();
    if (await assignButton.isVisible()) {
      await assignButton.click();
      const dialog = page.getByRole('dialog', { name: 'Assign Armband' });
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await expect(dialog).not.toBeVisible();
    }
  });

  test('reports page exposes financial and statistics report choices', async ({ page }) => {
    await page.goto('/secretary/reports', { waitUntil: 'networkidle' });

    await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible({ timeout: 15000 });
    const picker = page.locator('label:has-text("Report")').locator('..').getByRole('combobox');
    await picker.click();

    for (const label of ['Operational', 'Organization', 'Financial', 'Statistics']) {
      await expect(page.getByRole('group').filter({ hasText: label }).first()).toBeVisible();
    }

    for (const name of ['Financial Report', 'Show Entry Counts', 'Trial Entry Counts']) {
      await expect(page.getByRole('option', { name })).toBeVisible();
    }
  });
});

async function waitForDogSearch(page: Page, query: string) {
  await page.waitForResponse(
    response =>
      response.url().includes('/rest/v1/dogs') &&
      response.request().method() === 'GET' &&
      response.url().toLowerCase().includes(query),
    { timeout: 10000 }
  );
}
