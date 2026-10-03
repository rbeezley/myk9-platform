import { expect, test, type TestInfo } from '@playwright/test';
import { signInAsSecretary } from '../uat/shared/auth';
import {
  type BrowserHealth,
  createBrowserHealth,
  summarizeHealth,
  watchBrowserHealth,
  writeUatFinding,
} from '../uat/shared/artifacts';

/**
 * Suite category: feature-audit.
 *
 * Phase 2 re-walk proof for the post-Phase-A-through-F secretary show-day arc.
 * The fixture is the shared Heritage/June 2026 managed show used by recent
 * secretary show management audits.
 */

test.describe.configure({ mode: 'serial' });

const SHOW_ID = '4584f257-19b5-4016-aae6-5e7827b769cb';
const TRIAL_ID = 'cc5065ce-797b-4d07-9611-894dcc2670b8';
const REPORT_PATH = `/shows/${SHOW_ID}/reports?report=trial-secretary-report&trialId=${TRIAL_ID}`;
const healthByTest = new Map<string, BrowserHealth>();

test.describe('Phase 2 secretary show-day re-walk', () => {
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
    await writeUatFinding(testInfo, 'Secretary', 'Phase 2 show-day re-walk', status, details);
    healthByTest.delete(testInfo.testId);
  });

  // MYK9-957 deleted the Show Map tree this re-walk drove (row menus, roving
  // focus); the show home's own walk is secretaryShowWorkbenchUI.spec.ts.
  test('opens the official closeout PDF route from verified report params', async ({
    page,
  }, testInfo) => {
    await signInAsSecretary(page, REPORT_PATH);

    await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveURL(new RegExp('/shows/[^/]+/reports'));
    await expect(page.locator('body')).toContainText('QA Walk Show 1777260779');
    await expect(page.locator('body')).toContainText('trial-secretary-report');
    await expect(
      page.getByRole('button', { name: 'Download AKC Trial Secretary PDF' })
    ).toBeVisible();

    await expectBrowserHealthClean(testInfo);
  });
});

async function expectBrowserHealthClean(testInfo: TestInfo) {
  const health = healthByTest.get(testInfo.testId) ?? createBrowserHealth();
  expect(summarizeHealth(health)).toEqual([]);
}
