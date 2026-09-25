import { expect, test, type Page } from '@playwright/test';
import { signInAsSecretary } from '../shared/auth';
import {
  installSecretaryFixture,
  NON_OWNED_DOG_CALL_NAME,
  NON_OWNED_DOG_SEARCH,
  SECRETARY_FIXTURE_SHOW_ID,
} from '../../helpers/secretaryFixture';
import {
  type BrowserHealth,
  createBrowserHealth,
  summarizeHealth,
  watchBrowserHealth,
  writeUatFinding,
} from '../shared/artifacts';

test.describe.configure({ mode: 'serial' });

// Every show-scoped case runs on the hermetic secretary show
// (docs/plan-hermetic-e2e-fixtures.md). They opened the seeded show until
// staging was emptied on 2026-09-20; the mail-in case then read "Show not
// found." and the entries case rendered its chrome around a show that no
// longer existed, which passed or failed by timing.
const SHOW_ID = SECRETARY_FIXTURE_SHOW_ID;
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

    await expect(page.getByRole('heading', { name: 'Add Show', level: 2 })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText('Show Name *', { exact: true })).toBeVisible();
    await expect(page.getByText('Show Dates *', { exact: true })).toBeVisible();
    await expect(page.getByText('Entry Period', { exact: true })).toBeVisible();
    await expect(page.getByText('Location *', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Select a past show to clone' })).toBeVisible();
    await expect(page.getByText(/\d+ items? remaining/i)).toBeVisible();

    await page.getByRole('button', { name: /^Next$/ }).click();
    await expect(page.getByRole('alert')).toContainText(/\d+ items? needs? attention/i);
  });

  test('mail-in registration can find a non-owned dog and reach class selection', async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date('2026-05-15T12:00:00.000Z'));

    await installSecretaryFixture(page);
    await signInAsSecretary(page, `/secretary/register/${SHOW_ID}`);

    await expect(page.getByRole('heading', { name: 'Add entry for someone else' })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText('Enter on behalf of an exhibitor.')).toBeVisible();
    await expect(page.getByText(/Step 1 of 5/).first()).toBeVisible();

    const search = page.getByPlaceholder(/Search all dogs/i);
    await expect(search).toBeVisible();
    await search.fill(NON_OWNED_DOG_SEARCH);
    await waitForDogSearch(page, 'echo');

    await expect(page.getByText(/^\d+ dogs?/)).toBeVisible();
    await expect(page.getByText(/No dogs match your search/i)).not.toBeVisible();

    const dog = page.getByRole('checkbox', {
      name: `Select ${NON_OWNED_DOG_CALL_NAME}`,
      exact: true,
    });
    await expect(dog).toBeVisible();
    await expect(dog).toHaveAttribute('aria-checked', 'false');
    await dog.click();
    await expect(dog).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText(/1 selected/)).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: /^Next/ })).toBeEnabled();

    await page.getByRole('button', { name: /^Next/ }).click();
    await expect(page.getByRole('heading', { name: 'Select Classes', exact: true })).toBeVisible({
      timeout: 10000,
    });
  });

  test('entry management exposes review, waitlist, and export controls', async ({ page }) => {
    test.setTimeout(60_000);
    await installSecretaryFixture(page);
    await signInAsSecretary(page, `/shows/${SHOW_ID}/entries`);

    await expect(page.getByRole('heading', { name: 'Entry Management' })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole('button', { name: 'Add entry', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'More', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Export Full CSV' })).toBeVisible();
    await page.keyboard.press('Escape');

    await expect(
      page.getByRole('searchbox', { name: 'Search all show registrations' })
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /Needs review/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /All registrations/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Registrations', exact: true })).toBeVisible();

    await page.getByRole('tab', { name: 'Exceptions', exact: true }).click();
    await page.getByRole('button', { name: 'Waitlist', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Waitlist Management' })).toBeVisible();
    await page.getByRole('tab', { name: 'Registrations', exact: true }).click();
    await expect(page.getByRole('button', { name: /All registrations/ })).toBeVisible();
  });

  test('reports page exposes financial and statistics report choices', async ({ page }) => {
    await installSecretaryFixture(page);
    await signInAsSecretary(page, `/shows/${SHOW_ID}/reports`);

    await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible({ timeout: 15000 });
    const picker = page.locator('label:has-text("Report")').locator('..').getByRole('combobox');
    await picker.click();

    for (const label of ['Before the show', 'During the show', 'After the show', 'Anytime']) {
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
