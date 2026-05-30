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
 * Suite category: feature-audit.
 *
 * Phase 2 re-walk proof for the post-Phase-A-through-F secretary show-day arc.
 * The fixture is the shared Heritage/June 2026 managed show used by recent
 * secretary workbench audits.
 */

test.describe.configure({ mode: 'serial' });

const SHOW_ID = '4584f257-19b5-4016-aae6-5e7827b769cb';
const TRIAL_ID = 'cc5065ce-797b-4d07-9611-894dcc2670b8';
const WORKBENCH_PATH = `/secretary/shows/${SHOW_ID}`;
const REPORT_PATH = `/secretary/reports?report=trial-secretary-report&showId=${SHOW_ID}&trialId=${TRIAL_ID}`;
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

  test('walks Setup, Today, Show Map row actions, and Wrap-up without blockers', async ({
    page,
  }, testInfo) => {
    await openWorkbench(page);

    await expect(page.getByRole('tab', { name: 'Setup' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Today' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Wrap-up' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'About Setup' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Premium List' })).toBeVisible();

    await page.getByRole('tab', { name: 'Today' }).click();
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'About Today' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'What do I do if...' })).toBeVisible();
    for (const name of [
      'Late entry',
      'Hospitality',
      'Quick broadcast',
      'Message a class',
      'Incident log',
      'Schedule delay script',
      'Show Access Codes',
      'Show Map',
    ]) {
      await expect(page.getByRole('heading', { name })).toBeVisible();
    }
    await expect(page.getByRole('button', { name: /Add late entry/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Post broadcast/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Send class message/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Save incident/i })).toBeDisabled();

    await prepareShowMapRows(page);
    await assertRovingTreeFocus(page);
    await assertTrialRowActions(page);
    await assertClassRowActionsStayScoped(page);
    await assertEntryRowActionDialogs(page);

    await page.getByRole('tab', { name: 'Wrap-up' }).click();
    await expect(page.getByRole('heading', { name: 'Wrap-up', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Show-day reconciliation' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Incident closeout' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Results Control Verify results' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Reports Print and export' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Submit Results Send final files' })).toBeVisible();

    await expectBrowserHealthClean(testInfo);
  });

  test('opens the official closeout PDF route from verified report params', async ({
    page,
  }, testInfo) => {
    await signInAsSecretary(page, REPORT_PATH);

    await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveURL(new RegExp('/secretary/reports'));
    await expect(page.locator('body')).toContainText('QA Walk Show 1777260779');
    await expect(page.locator('body')).toContainText('trial-secretary-report');
    await expect(
      page.getByRole('button', { name: 'Download AKC Trial Secretary PDF' })
    ).toBeVisible();

    await expectBrowserHealthClean(testInfo);
  });
});

async function openWorkbench(page: Page) {
  await signInAsSecretary(page, WORKBENCH_PATH);
  await expect(page).toHaveURL(new RegExp(`/secretary/shows/${SHOW_ID}`));
  await expect(page.getByRole('heading', { name: /workbench$/i })).toBeVisible({
    timeout: 15000,
  });
}

async function prepareShowMapRows(page: Page) {
  await expect(page.getByRole('button', { name: 'Today', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tomorrow', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'All dates', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Active', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Completed', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Attention', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'All dates', exact: true }).click();
  await page.getByRole('button', { name: 'Expand trials', exact: true }).click();
  await expect(page.getByRole('treeitem').first()).toBeVisible();
  await page.getByRole('button', { name: /Expand Interior Advanced/i }).click();
  await expect(page.getByRole('button', { name: 'Actions for Ziva' })).toBeVisible();
}

async function assertRovingTreeFocus(page: Page) {
  const treeItems = page.getByRole('treeitem');
  await expect(treeItems).toHaveCount(7);
  await expect
    .poll(async () =>
      treeItems.evaluateAll(
        items => items.filter(item => item.getAttribute('tabindex') === '0').length
      )
    )
    .toBe(1);

  const firstNodeId = await treeItems.first().getAttribute('data-node-id');
  await treeItems.first().focus();
  await page.keyboard.press('ArrowDown');
  await expect
    .poll(async () =>
      page.evaluate(() => document.activeElement?.getAttribute('data-node-id') ?? null)
    )
    .not.toBe(firstNodeId);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape');
}

async function assertTrialRowActions(page: Page) {
  await page.getByRole('button', { name: 'Actions for Saturday Trial 1' }).click();
  await expect(page.getByRole('menuitem', { name: /Open Schedule/i })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /Print Trial Reports/i })).toBeVisible();
  await page.keyboard.press('Escape');
}

async function assertClassRowActionsStayScoped(page: Page) {
  await page.getByRole('button', { name: 'Actions for Interior Advanced' }).click();
  await expect(page.getByText('Recommended')).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /Mark Class Started/i }).first()).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /Print Check-In Sheet/i }).first()).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /Open Class/i })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /Mark checked in/i })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: /Move up/i })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: /Scratch \/ no-show/i })).toHaveCount(0);
  await page.keyboard.press('Escape');
}

async function assertEntryRowActionDialogs(page: Page) {
  await page.getByRole('button', { name: 'Actions for Ziva' }).click();
  await expect(page.getByRole('menuitem', { name: /Mark checked in/i })).toBeVisible();
  await page.getByRole('menuitem', { name: /Move up/i }).click();
  await expect(page.getByRole('dialog', { name: /Move up entry/i })).toBeVisible();
  await expect(page.getByText(/Current class: Interior Advanced/i)).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('button', { name: 'Actions for Ziva' }).click();
  await page.getByRole('menuitem', { name: /Scratch \/ no-show/i }).click();
  await expect(page.getByRole('dialog', { name: /Mark scratch \/ no-show/i })).toBeVisible();
  await expect(page.getByText(/Refunds are not automatic/i)).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
}

async function expectBrowserHealthClean(testInfo: TestInfo) {
  const health = healthByTest.get(testInfo.testId) ?? createBrowserHealth();
  expect(summarizeHealth(health)).toEqual([]);
}
