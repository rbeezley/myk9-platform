import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { signInAsSecretary } from '../shared/auth';
import {
  createBrowserHealth,
  summarizeHealth,
  watchBrowserHealth,
  writeUatFinding,
  type BrowserHealth,
} from '../shared/artifacts';

const SHOW_ID = '4584f257-19b5-4016-aae6-5e7827b769cb';
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

    await captureSecretaryPage(
      page,
      testInfo,
      `/secretary/entries/${SHOW_ID}`,
      'secretary-entry-management',
      page.getByRole('button', { name: 'Export CSV' })
    );

    await page.getByRole('tab', { name: 'Waitlist', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Waitlist Management' })).toBeVisible();
    await attachScreenshot(page, testInfo, 'secretary-waitlist');

    await captureSecretaryPage(
      page,
      testInfo,
      '/secretary/reports',
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
