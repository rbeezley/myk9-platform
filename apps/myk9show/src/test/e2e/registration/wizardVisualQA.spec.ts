import { expect, test, type Page } from '@playwright/test';
import { signInAsExhibitor } from '../helpers/testUsers';
import { LIVE_REGISTRATION_SHOW_ID } from '../uat/shared/seededShows';

test.describe.configure({ mode: 'serial', timeout: 120000 });

const SHOW_ID = LIVE_REGISTRATION_SHOW_ID;
const VISUAL_MATRIX = [
  { name: 'phone-light', width: 390, height: 844, colorScheme: 'light' as const },
  { name: 'phone-dark', width: 390, height: 844, colorScheme: 'dark' as const },
  { name: 'tablet-light', width: 960, height: 652, colorScheme: 'light' as const },
  { name: 'tablet-dark', width: 960, height: 652, colorScheme: 'dark' as const },
];

function captureConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', error => errors.push(error.message));
  return errors;
}

async function assertWizardShell(page: Page, consoleErrors: string[]) {
  await expect(page.getByRole('heading', { name: 'Register for Show' })).toBeVisible({
    timeout: 20000,
  });
  await expect(page.getByTestId('registration-wizard-header')).toBeVisible();
  await expect(page.getByTestId('registration-wizard-card')).toBeVisible();

  const headerBox = await page.getByTestId('registration-wizard-header').boundingBox();
  const cardBox = await page.getByTestId('registration-wizard-card').boundingBox();
  expect(headerBox).not.toBeNull();
  expect(cardBox).not.toBeNull();
  expect(cardBox!.y).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height);

  const firstCircle = await page.getByTestId('wizard-step-circle-0').boundingBox();
  const secondCircle = await page.getByTestId('wizard-step-circle-1').boundingBox();
  const connector = await page.getByTestId('wizard-step-connector-0').boundingBox();
  expect(firstCircle).not.toBeNull();
  expect(secondCircle).not.toBeNull();
  expect(connector).not.toBeNull();
  expect(connector!.x).toBeGreaterThanOrEqual(firstCircle!.x + firstCircle!.width - 1);
  expect(connector!.x + connector!.width).toBeLessThanOrEqual(secondCircle!.x + 1);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(Math.max(0, overflow)).toBe(0);
  expect(consoleErrors).toEqual([]);
}

async function selectFirstDog(page: Page) {
  await expect(page.getByRole('heading', { name: 'Select Dogs to Register' })).toBeVisible({
    timeout: 15000,
  });
  const namedDogOptions = page.locator('[role="checkbox"][aria-label^="Select "]');
  if ((await namedDogOptions.count()) > 0) {
    await namedDogOptions.first().click();
  } else {
    await page.getByRole('checkbox').first().click();
  }
  await expect(page.getByRole('button', { name: /^Next$/ })).toBeEnabled();
  await page.getByRole('button', { name: /^Next$/ }).click();
}

async function selectFirstClass(page: Page) {
  await expect(page.getByRole('heading', { name: 'Select Classes' })).toBeVisible({
    timeout: 15000,
  });
  const classes = page.getByRole('checkbox', { name: /^Select / });
  await expect(classes.first()).toBeVisible({ timeout: 15000 });
  await classes.first().click();
  await expect(page.getByRole('button', { name: /^Next$/ })).toBeEnabled();
  await page.getByRole('button', { name: /^Next$/ }).click();
}

for (const scenario of VISUAL_MATRIX) {
  test(`registration wizard ${scenario.name} has no shell regressions`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    await page.emulateMedia({ colorScheme: scenario.colorScheme });
    await page.addInitScript(({ colorScheme }) => {
      localStorage.setItem('myK9Q_settings', JSON.stringify({ theme: colorScheme }));
    }, scenario);

    const consoleErrors = captureConsoleErrors(page);
    await signInAsExhibitor(page, `/shows/${SHOW_ID}/register`);
    await assertWizardShell(page, consoleErrors);

    await page.screenshot({
      path: testInfo.outputPath(`registration-wizard-${scenario.name}-dogs.png`),
      fullPage: true,
    });
    await selectFirstDog(page);
    await page.screenshot({
      path: testInfo.outputPath(`registration-wizard-${scenario.name}-classes.png`),
      fullPage: true,
    });
    await selectFirstClass(page);
    await expect(page.getByRole('heading', { name: 'Payment Information' })).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`registration-wizard-${scenario.name}-payment.png`),
      fullPage: true,
    });

    await page.getByRole('button', { name: 'Save Draft' }).click();
    const saveDialog = page.getByRole('dialog');
    await expect(saveDialog).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`registration-wizard-${scenario.name}-draft-dialog.png`),
      fullPage: true,
    });
    await saveDialog.getByLabel('Draft Title').fill(`Visual QA ${scenario.name}`);
    await saveDialog.getByRole('button', { name: 'Save Draft' }).click();
    await expect(page.getByRole('button', { name: /Load Draft \(1\)/ })).toBeVisible();
  });
}

test('registration wizard covers dog, class, payment, and draft dialog states', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => {
    localStorage.setItem('myK9Q_settings', JSON.stringify({ theme: 'light' }));
  });

  const consoleErrors = captureConsoleErrors(page);
  await signInAsExhibitor(page, `/shows/${SHOW_ID}/register`);
  await assertWizardShell(page, consoleErrors);

  await selectFirstDog(page);
  await expect(page.getByRole('heading', { name: 'Select Classes' })).toBeVisible();
  await selectFirstClass(page);
  await expect(page.getByRole('heading', { name: 'Payment Information' })).toBeVisible();

  await page.getByRole('button', { name: 'Save Draft' }).click();
  const saveDialog = page.getByRole('dialog');
  await saveDialog.getByLabel('Draft Title').fill('Visual QA Draft');
  await saveDialog.getByRole('button', { name: 'Save Draft' }).click();

  await page.getByRole('button', { name: /^Back$/ }).click();
  await page.getByRole('button', { name: /^Back$/ }).click();
  const selectedDog = page.locator('[role="checkbox"][aria-checked="true"]').first();
  await expect(selectedDog).toBeVisible();
  await selectedDog.click();

  const loadDraftButton = page.getByRole('button', { name: /Load Draft \(1\)/ });
  await expect(loadDraftButton).toBeVisible();
  await loadDraftButton.click();
  const loadDialog = page.getByRole('dialog');
  await expect(loadDialog).toContainText('Visual QA Draft');
  await loadDialog.getByText('Visual QA Draft').click();
  await loadDialog.getByRole('button', { name: 'Load Selected Draft' }).click();
  await expect(page.getByText('Draft loaded successfully')).toBeVisible();
  await page.getByRole('button', { name: /^Back$/ }).click();
  await page.getByRole('button', { name: /^Back$/ }).click();
  await expect(page.locator('[role="checkbox"][aria-checked="true"]').first()).toBeVisible();

  await page.screenshot({
    path: testInfo.outputPath('registration-wizard-payment-and-draft.png'),
    fullPage: true,
  });
  await assertWizardShell(page, consoleErrors);
});
