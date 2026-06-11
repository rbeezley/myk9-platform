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
 * Feature-audit smoke for the canonical secretary show management routes.
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

test.describe('Secretary show management UI', () => {
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
    await writeUatFinding(testInfo, 'Secretary', 'show management feature audit', status, details);
    healthByTest.delete(testInfo.testId);
  });

  test('renders setup and show desk phases for a managed show', async ({
    page,
  }, testInfo) => {
    await openShowSetup(page);

    await expect(page.getByTestId('canonical-show-management-nav')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Setup' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Show Desk' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'More show actions' }).first()).toBeVisible();

    await expect(page.getByRole('region', { name: 'Setup', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Setup', exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Setup readiness' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Finish setup|Setup ready/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Premium List' }).first()).toBeVisible();

    await page.getByRole('link', { name: 'Show Desk' }).click();
    await expect(page).toHaveURL(new RegExp(`/shows/${SHOW_ID}/show-desk`));
    const toolsPanel = await openToolsPanel(page);
    await expect(toolsPanel.getByRole('button', { name: /Message Show/i })).toHaveCount(0);
    await toolsPanel.getByRole('button', { name: /close/i }).click();
    await expectWorkbenchSection(page, 'Show status');
    await expectWorkbenchSection(page, 'Pending signals');
    await expect(page.getByRole('heading', { name: 'Show Map' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Show map shortcuts' })).toBeVisible();

    await expectBrowserHealthClean(testInfo);
  });

  test('keeps incident actions visibly guarded before mutation', async ({ page }, testInfo) => {
    await openShowDesk(page);
    const toolsPanel = await openToolsPanel(page);

    await expect(toolsPanel.getByRole('button', { name: /Message Show/i })).toHaveCount(0);

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

async function openShowSetup(page: Page) {
  await signInAsSecretary(page, `/shows/${SHOW_ID}/setup`);
  await expect(page).toHaveURL(new RegExp(`/shows/${SHOW_ID}/setup`));
  await expect(page.getByRole('heading', { name: 'Setup', exact: true })).toBeVisible({
    timeout: 15000,
  });
}

async function openShowDesk(page: Page) {
  await signInAsSecretary(page, `/shows/${SHOW_ID}/show-desk`);
  await expect(page).toHaveURL(new RegExp(`/shows/${SHOW_ID}/show-desk`));
  await expect(page.getByRole('button', { name: /open tools panel/i })).toBeVisible({
    timeout: 15000,
  });
}

async function openToolsPanel(page: Page) {
  await page.getByRole('button', { name: /open tools panel/i }).click();
  const toolsPanel = page.getByRole('dialog', { name: /show desk tools/i });
  await expect(toolsPanel).toBeVisible({ timeout: 10000 });
  return toolsPanel;
}

async function expectWorkbenchSection(page: Page, name: string) {
  await expect(page.getByRole('region', { name })).toBeVisible({ timeout: 10000 });
}

async function expectBrowserHealthClean(testInfo: TestInfo) {
  const health = healthByTest.get(testInfo.testId) ?? createBrowserHealth();
  expect(summarizeHealth(health)).toEqual([]);
}
