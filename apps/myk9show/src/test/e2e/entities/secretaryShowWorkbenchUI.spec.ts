import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { signInAsSecretary } from '../uat/shared/auth';
import { LIVE_SECRETARY_SHOW_ID } from '../uat/shared/seededShows';
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
 * entries. It proves the real secretary show home (Overview, with its Tools sheet)
 * renders without console errors or owned 4xx/5xx responses.
 */

// Keep this smoke serial so a broken phase-render check stops the dependent
// interaction guard instead of producing duplicate noise against the same route.
test.describe.configure({ mode: 'serial' });

// The seeded live show; the old QA Walk show fixture was reseeded away.
const SHOW_ID = LIVE_SECRETARY_SHOW_ID;
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

  test('renders the four-tab show home for a managed show', async ({ page }, testInfo) => {
    await openShowSetup(page);

    // MYK9-957: four tabs; Setup and Show Day folded into the Overview home.
    await expect(page.getByRole('link', { name: 'Show Desk' })).toHaveCount(0);
    await expect(page.getByRole('tab')).toHaveText([
      /^Overview/,
      /^Entries/,
      /^Results/,
      /^Reports/,
    ]);
    // Link crawl: nothing on the home links to a retired section URL; those
    // exist only as redirects (MYK9-957 AC).
    const hrefs = await page
      .locator('a[href]')
      .evaluateAll(anchors => anchors.map(a => a.getAttribute('href') ?? ''));
    expect(hrefs.length).toBeGreaterThan(0);
    expect(hrefs.filter(href => /\/(?:setup|show-day|show-desk)(?:[/?#]|$)/.test(href))).toEqual(
      []
    );
    // The header `...` menu is deleted (MYK9-630); its verbs moved to the app
    // header Actions menu, the Overview landing card and the Show Edit panel.
    await expect(page.getByRole('button', { name: 'More show actions' })).toHaveCount(0);
    await expect(page.getByTestId('header-actions-trigger')).toBeVisible();

    await expect(page.getByRole('heading', { name: 'Show schedule' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Premium List' }).first()).toBeVisible();

    const toolsPanel = await openToolsPanel(page);
    await expect(toolsPanel.getByRole('button', { name: /Message Show/i })).toHaveCount(0);
    // MYK9-954: two groups; Add entries moved to the Entries tab.
    await expect(toolsPanel.getByRole('heading', { name: 'Show day' })).toBeVisible();
    await expect(toolsPanel.getByRole('heading', { name: 'Show logistics' })).toBeVisible();
    await expect(toolsPanel.getByRole('button', { name: /Add entries/i })).toHaveCount(0);
    await toolsPanel.getByRole('button', { name: /close/i }).click();
    await expect(page.getByRole('heading', { name: 'Show Map' })).toHaveCount(0);

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

    // MYK9-954: the delay script moved to the class panel's "Announce the
    // delay", offered once a class's expected start runs late; covered by
    // SecretaryCockpitFocusedClass.test.tsx.

    await expectBrowserHealthClean(testInfo);
  });
});

async function openShowSetup(page: Page) {
  await signInAsSecretary(page, `/shows/${SHOW_ID}/setup`);
  await expect(page).toHaveURL(new RegExp(`/shows/${SHOW_ID}$`));
  await expect(page.getByRole('heading', { name: 'Show schedule' })).toBeVisible({
    timeout: 15000,
  });
}

async function openShowDesk(page: Page) {
  // The retired Show Day URL still lands on the home (MYK9-957 redirect).
  await signInAsSecretary(page, `/shows/${SHOW_ID}/show-day`);
  await expect(page).toHaveURL(new RegExp(`/shows/${SHOW_ID}$`));
  await expect(page.getByRole('button', { name: /^Tools/ })).toBeVisible({
    timeout: 15000,
  });
}

async function openToolsPanel(page: Page) {
  await page.getByRole('button', { name: /^Tools/ }).click();
  const toolsPanel = page.getByRole('dialog', { name: /show tools/i });
  await expect(toolsPanel).toBeVisible({ timeout: 10000 });
  return toolsPanel;
}

async function expectBrowserHealthClean(testInfo: TestInfo) {
  const health = healthByTest.get(testInfo.testId) ?? createBrowserHealth();
  expect(summarizeHealth(health)).toEqual([]);
}
