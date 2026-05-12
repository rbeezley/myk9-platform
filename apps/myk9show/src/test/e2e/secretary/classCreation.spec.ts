import { expect, test, type Page } from '@playwright/test';
import { AKC_SCENT_WORK_TEMPLATE } from '@/data/templates/akcScentWorkTemplate';
import { signInAsSecretary } from '../uat/shared/auth';

const TRIAL_ID = 'trial-123';
const TEMPLATE_STORAGE = 'myk9show-template-storage';
const seededTemplate = {
  ...AKC_SCENT_WORK_TEMPLATE,
  id: 'akc-scent-work-official-2024',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  createdBy: 'system',
};

test.describe('Secretary Class Creation Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await seedTemplateStore(page);
    await signInAsSecretary(page, `/trials/${TRIAL_ID}/classes/create`);
  });

  test('opens template selection and validates before proceeding', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Create Classes' })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText(`Trial: ${TRIAL_ID}`)).toBeVisible();
    await expect(page.getByText('Step 1 of 4')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Step 1: Select Organization' })).toBeVisible();

    await page.getByRole('button', { name: /^Next$/ }).click();
    await expect(page.getByText('Please select a template')).toBeVisible();
    await expect(page.getByText('Step 1 of 4')).toBeVisible();
  });

  test('lists the AKC Scent Work template for secretary selection', async ({ page }) => {
    await page.getByRole('combobox').first().click();
    await page.getByRole('option', { name: 'AKC', exact: true }).click();
    await page.getByRole('combobox').nth(1).click();
    await page.getByRole('option', { name: 'Scent Work', exact: true }).click();

    await expect(page.getByText('AKC selected')).toBeVisible();
    await expect(page.getByText('Scent Work selected')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Step 3: Select Template' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'AKC Scent Work - Official 2024 Rules' })
    ).toBeVisible();
    await expect(page.getByText(/\d+ classes/)).toBeVisible();
    await expect(page.getByText(/\d+ fields/)).toBeVisible();
  });
});

async function seedTemplateStore(page: Page) {
  await page.addInitScript(
    ({ key, template }) => {
      window.localStorage.setItem(
        key,
        JSON.stringify({
          state: {
            templates: [template],
            isInitialized: true,
          },
          version: 1,
        })
      );
    },
    { key: TEMPLATE_STORAGE, template: seededTemplate }
  );
}
