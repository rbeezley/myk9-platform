import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { signInAsSecretary } from '../uat/shared/auth';
import {
  type BrowserHealth,
  createBrowserHealth,
  summarizeHealth,
  watchBrowserHealth,
  writeUatFinding,
} from '../uat/shared/artifacts';

/**
 * Feature-audit smoke for the Secretary Show Workbench.
 *
 * This intentionally avoids posting announcements, messages, incidents, or late
 * entries. It proves the real secretary route renders the setup and Show Desk
 * surfaces together without console errors or owned 4xx/5xx responses.
 */

// Keep this smoke serial so a broken phase-render check stops the dependent
// interaction guard instead of producing duplicate noise against the same route.
test.describe.configure({ mode: 'serial' });

const SHOW_ID = '4584f257-19b5-4016-aae6-5e7827b769cb';
const healthByTest = new Map<string, BrowserHealth>();

test.describe('Secretary Show Workbench UI', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    const health = createBrowserHealth();
    healthByTest.set(testInfo.testId, health);
    watchBrowserHealth(page, health);
  });

  test.afterEach(async ({ page }, testInfo) => {
    const health = healthByTest.get(testInfo.testId) ?? createBrowserHealth();
    if (page.isClosed()) {
      health.pageErrors.push('page closed before QA artifact write');
    }
    const details = summarizeHealth(health);
    const status = testInfo.status === testInfo.expectedStatus ? 'passed' : 'failed';
    await writeUatFinding(testInfo, 'Secretary', 'show workbench feature audit', status, details);
    healthByTest.delete(testInfo.testId);
  });

  test('renders setup and show desk phases for a managed show', async ({
    page,
  }, testInfo) => {
    await openWorkbench(page);

    await expect(page.getByRole('heading', { name: /workbench$/i })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole('button', { name: 'Edit' }).first()).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Setup' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Show Desk' })).toBeVisible();

    await expect(page.getByRole('heading', { name: 'Setup', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'About Setup' })).toBeVisible();
    await expect(
      page.getByText(/confirm the schedule, judges, show page, and materials/i)
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Premium List' })).toBeVisible();

    await page.getByRole('tab', { name: 'Show Desk' }).click();
    await page.getByRole('button', { name: /open tools panel/i }).click();
    const toolsPanel = page.getByRole('dialog', { name: 'Tools panel' });
    await expect(toolsPanel.getByRole('button', { name: /Message Show/i })).toBeVisible();
    await toolsPanel.getByRole('button', { name: /close/i }).click();
    await expectWorkbenchSection(page, 'Closeout');
    await expect(page.getByRole('heading', { name: 'Show-day reconciliation' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Incident closeout' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Results Control Verify results' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Reports Print and export' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Submit Results Send final files' })).toBeVisible();

    await expectBrowserHealthClean(testInfo);
  });

  test('keeps communication and incident actions visibly guarded before mutation', async ({
    page,
  }, testInfo) => {
    await openWorkbench(page);
    await page.getByRole('tab', { name: 'Show Desk' }).click();
    await page.getByRole('button', { name: /open tools panel/i }).click();
    const toolsPanel = page.getByRole('dialog', { name: 'Tools panel' });

    await toolsPanel.getByRole('button', { name: /Message Show/i }).click();
    await expect(toolsPanel.getByRole('heading', { name: 'Message Show' })).toBeVisible();
    await expect(toolsPanel.getByRole('combobox', { name: 'Recipient' })).toBeVisible();
    await expect(toolsPanel.getByLabel('Title')).toHaveValue(/.+/);
    await expect(toolsPanel.getByLabel('Message')).toHaveValue(/.+/);
    await expect(toolsPanel.getByLabel('Send push alert')).toBeVisible();
    await expect(toolsPanel.getByRole('button', { name: /Reset/i })).toBeVisible();

    await toolsPanel.getByRole('button', { name: /Incident log/i }).click();
    const incidentLog = toolsPanel.getByRole('region', { name: 'Incident log' });
    const saveIncident = incidentLog.getByRole('button', { name: /Save incident/i });
    await expect(saveIncident).toBeDisabled();
    await incidentLog.getByLabel('Short summary').fill('Feature-audit visibility check');
    await expect(saveIncident).toBeEnabled();
    await incidentLog.getByRole('button', { name: /Reset/i }).click();
    await expect(saveIncident).toBeDisabled();

    await toolsPanel.getByRole('button', { name: /Delay scripts/i }).click();
    const scheduleDelay = toolsPanel.getByRole('region', { name: 'Schedule delay script' });
    await scheduleDelay.getByLabel('Delay minutes').fill('20');
    await scheduleDelay.getByLabel('Affected class').fill('Container Novice A');
    await expect(scheduleDelay.getByLabel('PA script')).toContainText('20 minutes');
    await expect(scheduleDelay.getByRole('button', { name: /Copy script/i })).toBeVisible();
    await expect(scheduleDelay.getByRole('button', { name: /Post announcement/i })).toBeVisible();

    await expectBrowserHealthClean(testInfo);
  });
});

async function openWorkbench(page: Page) {
  await signInAsSecretary(page, `/secretary/shows/${SHOW_ID}`);
  await expect(page).toHaveURL(new RegExp(`/secretary/shows/${SHOW_ID}`));
  await expect(page.getByRole('heading', { name: /workbench$/i })).toBeVisible({
    timeout: 15000,
  });
}

async function expectWorkbenchSection(page: Page, name: string) {
  await expect(page.getByRole('region', { name })).toBeVisible({ timeout: 10000 });
}

async function expectBrowserHealthClean(testInfo: TestInfo) {
  const health = healthByTest.get(testInfo.testId) ?? createBrowserHealth();
  expect(summarizeHealth(health)).toEqual([]);
}
