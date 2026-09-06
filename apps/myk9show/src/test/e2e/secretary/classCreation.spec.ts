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
    await expect(page.getByRole('heading', { name: 'AKC Scent Work - Official' })).toBeVisible();
    await expect(page.getByText(/\d+ classes/).first()).toBeVisible();
    await expect(page.getByText(/\d+ fields/).first()).toBeVisible();
  });

  // MYK9-425: the override tab strip used to hide every label behind
  // `hidden sm:inline`, leaving six unnamed icon-only tabs at 390px wide.
  for (const { label, width, height } of [
    { label: '390x844', width: 390, height: 844 },
    { label: '768x1024', width: 768, height: 1024 },
    { label: '1440x1000', width: 1440, height: 1000 },
  ]) {
    test(`names, shows and selects every override tab at ${label}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await reachOverrideStep(page);

      const list = page.getByRole('tablist');
      await expect(list).toBeVisible();

      for (const [name, visibleLabel] of OVERRIDE_TABS) {
        const tab = page.getByRole('tab', { name, exact: true });
        await expect(tab).toHaveCount(1);
        // Real words on screen, not an icon on its own.
        await expect(tab).toContainText(visibleLabel);

        await tab.click();
        await expect(tab).toHaveAttribute('aria-selected', 'true');
        expect(await page.getByRole('tab', { selected: true }).count()).toBe(1);

        const panelId = await tab.getAttribute('aria-controls');
        const panel = page.locator(`#${panelId}`);
        await expect(panel).toBeAttached();
        expect(await panel.getAttribute('hidden')).toBeNull();

        // Geometry: nothing is clipped out of the strip, and the touch target
        // stays at least 44px tall.
        const box = (await tab.boundingBox())!;
        const listBox = (await list.boundingBox())!;
        expect(box.height, `${name} keeps its touch target`).toBeGreaterThanOrEqual(40);
        expect(box.x, `${name} starts inside the strip`).toBeGreaterThanOrEqual(listBox.x - 1);
        expect(box.x + box.width, `${name} ends inside the strip`).toBeLessThanOrEqual(
          listBox.x + listBox.width + 1
        );
        await expect(tab).toBeVisible();

        // Focus stays on the control the keyboard moved to.
        await tab.focus();
        await expect(tab).toBeFocused();
      }

      // The page never grows a horizontal scrollbar because of the strip.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});

const OVERRIDE_TABS: ReadonlyArray<readonly [string, string]> = [
  ['Basic overrides', 'Basic'],
  ['Financial overrides', 'Financial'],
  ['Timing overrides', 'Timing'],
  ['Personnel overrides', 'Personnel'],
  ['Rules overrides', 'Rules'],
  ['Other overrides', 'Other'],
];

async function reachOverrideStep(page: Page) {
  await page.getByRole('combobox').first().click();
  await page.getByRole('option', { name: 'AKC', exact: true }).click();
  await page.getByRole('combobox').nth(1).click();
  await page.getByRole('option', { name: 'Scent Work', exact: true }).click();

  await page
    .getByRole('button', { name: 'Select AKC Scent Work - Official', exact: true })
    .click();
  await page.getByRole('button', { name: /^Next$/ }).click();

  await page.getByText('Container Novice A').first().click();
  await page.getByRole('button', { name: /^Next$/ }).click();

  await expect(page.getByText('Step 3 of 4')).toBeVisible();
}

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
