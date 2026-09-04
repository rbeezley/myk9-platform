import { test, expect, type Page } from '@playwright/test';
import { signInAsExhibitor } from './helpers/testUsers';

/**
 * MYK9-88 — the Add/Edit dog sex/gender comboboxes and the Add-dog photo action
 * reached assistive technology with NO accessible name. Base UI's Select.Trigger
 * renders a native button; without an `id` matching FormField's `<Label htmlFor>`
 * nothing associates the visible label with the control, and an icon-only photo
 * button has no text to fall back on.
 *
 * Unit tests pin the same names, but only in jsdom against a mounted tab. This
 * spec opens the ACTUAL panels in a real browser and reads the real accessibility
 * tree, at the three viewports the audit walked. It is audit-only: it opens the
 * panels and closes them, and never saves.
 */

const VIEWPORTS = [
  { label: 'mobile', width: 390, height: 844 },
  { label: 'tablet', width: 834, height: 1112 },
  { label: 'desktop', width: 1280, height: 800 },
];

async function openFirstDogDetail(page: Page) {
  const firstDog = page.locator('h3 a[href^="/dogs/"]').first();
  await expect(firstDog).toBeVisible();
  await firstDog.click();
  await page.waitForURL(/\/dogs\/[0-9a-f-]{36}/, { waitUntil: 'commit' });
}

for (const vp of VIEWPORTS) {
  test.describe(`Dog panel accessible names @ ${vp.label}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
    });

    test('Add Dog names its sex combobox and photo action', async ({ page }) => {
      await signInAsExhibitor(page, '/dogs');
      await page
        .getByRole('button', { name: /Add Dog/i })
        .first()
        .click();
      await expect(page.getByRole('heading', { name: 'Add New Dog' })).toBeVisible();

      const sex = page.getByRole('combobox', { name: /^Sex/ });
      await expect(sex).toMatchAriaSnapshot(`- combobox "Sex (required)"`);
      await expect(page.getByRole('button', { name: 'Add dog photo' })).toBeVisible();

      // Naming must not cost keyboard operation: the trigger takes focus, opens
      // on Enter, and Escape returns focus to it.
      await sex.focus();
      await expect(sex).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('option', { name: /Male/ }).first()).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(sex).toBeFocused();
    });

    test('Edit Dog names its gender combobox and photo action', async ({ page }) => {
      await signInAsExhibitor(page, '/dogs');
      await openFirstDogDetail(page);
      await page.getByRole('button', { name: 'Edit', exact: true }).first().click();

      const gender = page.getByRole('combobox', { name: /^Gender/ });
      await expect(gender).toMatchAriaSnapshot(`- combobox "Gender (required)"`);
      await expect(page.getByRole('button', { name: 'Change Photo' })).toBeVisible();

      await gender.focus();
      await expect(gender).toBeFocused();
    });
  });
}
