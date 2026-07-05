import { expect, test, type Page } from '@playwright/test';
import { signInAsSecretary } from '../shared/auth';
import { LIVE_SECRETARY_SHOW_ID } from '../shared/seededShows';
import {
  type BrowserHealth,
  createBrowserHealth,
  summarizeHealth,
  watchBrowserHealth,
  writeUatFinding,
} from '../shared/artifacts';

test.describe.configure({ mode: 'serial' });

const SHOW_ID = LIVE_SECRETARY_SHOW_ID;
const healthByTest = new Map<string, BrowserHealth>();

test.describe('Phase 1 UAT - Secretary critical path', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    const health = createBrowserHealth();
    healthByTest.set(testInfo.testId, health);
    watchBrowserHealth(page, health);
  });

  test.afterEach(async ({ page }, testInfo) => {
    void page;
    const health = healthByTest.get(testInfo.testId) ?? createBrowserHealth();
    const details = summarizeHealth(health);
    const status = testInfo.status === testInfo.expectedStatus ? 'passed' : 'failed';
    await writeUatFinding(testInfo, 'Secretary', 'critical path', status, details);
    healthByTest.delete(testInfo.testId);
  });

  test('dashboard shows secretary command center and show creation affordance', async ({
    page,
  }) => {
    await signInAsSecretary(page, '/secretary/dashboard');

    await expect(
      page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })
    ).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole('link', { name: 'Add Show' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Personal tasks' })).toBeVisible();
    // Messages is no longer a dashboard/sidebar link; PR #592 consolidated it
    // into the top Message Center panel.
    await expect(page.getByRole('button', { name: /^Message Center/ })).toBeVisible();
  });

  test('show creation wizard starts with clear required fields and validation feedback', async ({
    page,
  }) => {
    await signInAsSecretary(page, '/secretary/create-show/wizard');

    await expect(page.getByRole('heading', { name: 'Create New Show', level: 2 })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText('Show Name *', { exact: true })).toBeVisible();
    await expect(page.getByText('Show Dates *', { exact: true })).toBeVisible();
    await expect(page.getByText('Entry Period *', { exact: true })).toBeVisible();
    await expect(page.getByText('Location *', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Select a past show to clone' })).toBeVisible();
    await expect(page.getByText(/\d+ items? remaining/i)).toBeVisible();

    await page.getByRole('button', { name: /^Next$/ }).click();
    await expect(page.getByRole('alert')).toContainText(/\d+ items? needs? attention/i);
  });

  test('mail-in registration can find a non-owned dog and reach class selection', async ({
    page,
  }) => {
    await signInAsSecretary(page, `/secretary/register/${SHOW_ID}`);

    await expect(page.getByRole('heading', { name: 'Add mail-in entry' })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText('Enter on behalf of an exhibitor.')).toBeVisible();
    await expect(page.getByText(/Step 1 of 5/).first()).toBeVisible();

    const search = page.getByPlaceholder(/Search all dogs/i);
    await expect(search).toBeVisible();
    await search.fill('Ranger');
    await waitForDogSearch(page, 'ranger');

    await expect(page.getByText(/^\d+ dogs?/)).toBeVisible();
    await expect(page.getByText(/No dogs match your search/i)).not.toBeVisible();

    await page.getByText('Ranger', { exact: true }).last().click();
    await expect(page.getByText(/1 selected/)).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: /^Next/ })).toBeEnabled();

    await page.getByRole('button', { name: /^Next/ }).click();
    await expect(page.getByRole('heading', { name: 'Select Classes' })).toBeVisible({
      timeout: 10000,
    });
  });

  test('entry management exposes review, waitlist, armband, and export controls', async ({
    page,
  }) => {
    await signInAsSecretary(page, `/shows/${SHOW_ID}/entry-management`);

    await expect(page.getByRole('heading', { name: 'Entry Management' })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole('button', { name: 'Add mail-in entry' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export CSV' })).toBeVisible();
    await expect(page.getByText('Total Entries', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Need review', { exact: true })).toBeVisible();
    await expect(page.getByText('Confirmed entries', { exact: true })).toBeVisible();

    await expect(page.getByRole('textbox', { name: 'Search entries' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Entries', exact: true })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByRole('group', { name: 'Quick view presets' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Review', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Day-of', exact: true })).toBeVisible();

    await page.getByRole('tab', { name: 'Waitlist', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Waitlist Management' })).toBeVisible();
    await page.getByRole('tab', { name: 'Entries', exact: true }).click();

    const rowActions = page.getByRole('button', { name: /^Actions for / }).first();
    await expect(rowActions).toBeVisible({ timeout: 10000 });
    await rowActions.click();
    await expect(
      page.getByRole('menuitem', { name: /Assign armband|Change armband/i }).first()
    ).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('reports page exposes financial and statistics report choices', async ({ page }) => {
    await signInAsSecretary(page, `/shows/${SHOW_ID}/reports`);

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
