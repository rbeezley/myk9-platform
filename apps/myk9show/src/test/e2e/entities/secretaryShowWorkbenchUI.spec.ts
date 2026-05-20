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
 * entries. It proves the real secretary route renders the new setup, today, and
 * wrap-up surfaces together without console errors or owned 4xx/5xx responses.
 */

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
    void page;
    const health = healthByTest.get(testInfo.testId) ?? createBrowserHealth();
    const details = summarizeHealth(health);
    const status = testInfo.status === testInfo.expectedStatus ? 'passed' : 'failed';
    await writeUatFinding(testInfo, 'Secretary', 'show workbench feature audit', status, details);
    healthByTest.delete(testInfo.testId);
  });

  test('renders setup, today, and wrap-up workbench phases for a managed show', async ({
    page,
  }, testInfo) => {
    await openWorkbench(page);

    await expect(page.getByRole('heading', { name: /workbench$/i })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Setup' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Today' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Wrap-up' })).toBeVisible();

    await expect(page.getByRole('heading', { name: 'Setup', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'About Setup' })).toBeVisible();
    await expect(
      page.getByText(/confirm the schedule, judges, show page, and materials/i)
    ).toBeVisible();
    await expect(page.getByText(/Premium/i).first()).toBeVisible();

    await page.getByRole('tab', { name: 'Today' }).click();
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
    await expectWorkbenchSection(page, 'Late entry');
    await expectWorkbenchSection(page, 'Judge hospitality');
    await expectWorkbenchSection(page, 'Quick broadcast');
    await expectWorkbenchSection(page, 'Message a class');
    await expectWorkbenchSection(page, 'Incident log');
    await expectWorkbenchSection(page, 'Schedule delay script');
    await expect(page.getByRole('button', { name: /Add late entry/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Post broadcast/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Send class message/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Save incident/i })).toBeDisabled();

    await page.getByRole('tab', { name: 'Wrap-up' }).click();
    await expect(page.getByRole('heading', { name: 'Wrap-up', exact: true })).toBeVisible();
    await expectWorkbenchSection(page, 'Show-day reconciliation');
    await expectWorkbenchSection(page, 'Incident closeout');
    await expect(page.getByRole('link', { name: 'Results Control Verify results' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Reports Print and export' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Submit Results Send final files' })).toBeVisible();

    await expectBrowserHealthClean(testInfo);
  });

  test('keeps communication and incident actions visibly guarded before mutation', async ({
    page,
  }, testInfo) => {
    await openWorkbench(page);
    await page.getByRole('tab', { name: 'Today' }).click();

    const quickBroadcast = page.getByRole('region', { name: 'Quick broadcast' });
    await expect(quickBroadcast.getByLabel('Title')).toHaveValue(/.+/);
    await expect(quickBroadcast.getByLabel('Message')).toHaveValue(/.+/);
    await expect(quickBroadcast.getByLabel('Send push alert')).toBeVisible();

    const classMessage = page.getByRole('region', { name: 'Message a class' });
    await expect(classMessage.getByLabel('Class')).toBeVisible();
    await expect(classMessage.getByLabel('Message')).toBeVisible();
    await expect(classMessage.getByRole('button', { name: /Reset/i })).toBeVisible();

    const incidentLog = page.getByRole('region', { name: 'Incident log' });
    const saveIncident = incidentLog.getByRole('button', { name: /Save incident/i });
    await expect(saveIncident).toBeDisabled();
    await incidentLog.getByLabel('Short summary').fill('Feature-audit visibility check');
    await expect(saveIncident).toBeEnabled();
    await incidentLog.getByRole('button', { name: /Reset/i }).click();
    await expect(saveIncident).toBeDisabled();

    const scheduleDelay = page.getByRole('region', { name: 'Schedule delay script' });
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
