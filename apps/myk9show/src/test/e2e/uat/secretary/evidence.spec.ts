import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { signInAsSecretary } from '../shared/auth';
import { LIVE_SECRETARY_SHOW_ID } from '../shared/seededShows';
import {
  createBrowserHealth,
  summarizeHealth,
  watchBrowserHealth,
  writeUatFinding,
  type BrowserHealth,
} from '../shared/artifacts';

const SHOW_ID = LIVE_SECRETARY_SHOW_ID;
const healthByTest = new Map<string, BrowserHealth>();

test.describe('Phase 1 UAT - Secretary evidence pass', () => {
  test.setTimeout(60000);

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
    await writeUatFinding(testInfo, 'Secretary', 'evidence pass', status, details);
    healthByTest.delete(testInfo.testId);
  });

  test('captures visible Secretary journey evidence', async ({ page }, testInfo) => {
    await signInAsSecretary(page, '/secretary/dashboard');

    await captureSecretaryPage(
      page,
      testInfo,
      '/secretary/dashboard',
      'secretary-dashboard',
      page.getByRole('link', { name: 'Add Show' })
    );

    await page.goto(`/shows/${SHOW_ID}/entry-management`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Entry Management' })).toBeVisible({
      timeout: 15000,
    });
    await page.getByRole('button', { name: 'More', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Export Full CSV' })).toBeVisible();
    await attachScreenshot(page, testInfo, 'secretary-entry-management');

    await page.getByRole('tab', { name: 'Waitlist', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Waitlist Management' })).toBeVisible();
    await attachScreenshot(page, testInfo, 'secretary-waitlist');

    await captureSecretaryPage(
      page,
      testInfo,
      `/shows/${SHOW_ID}/reports`,
      'secretary-reports',
      page.getByRole('heading', { name: 'Reports' })
    );
  });
});

async function captureSecretaryPage(
  page: Page,
  testInfo: TestInfo,
  url: string,
  name: string,
  readyLocator: ReturnType<Page['getByRole']>
) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await expect(readyLocator).toBeVisible({ timeout: 15000 });
  await attachScreenshot(page, testInfo, name);
}

async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  const outputDir = path.resolve(process.cwd(), 'test-results', 'uat', 'evidence');
  await mkdir(outputDir, { recursive: true });
  const filePath = path.join(outputDir, `${name}.png`);
  const body = await page.screenshot({ fullPage: true });
  await writeFile(filePath, body);

  await testInfo.attach(name, {
    path: filePath,
    contentType: 'image/png',
  });
}
