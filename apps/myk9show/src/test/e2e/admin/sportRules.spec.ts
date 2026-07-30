import { test, expect } from '@playwright/test';
import { TestSetup } from '../helpers/testSetup';

/**
 * /admin/templates is a READ-ONLY view of the sport rules seeded in
 * `sport_templates` / `sport_class_rules`. Rules change by reviewed migration,
 * never from the client — see docs/plan-template-authoring-removal.md.
 *
 * This spec deliberately asserts the ABSENCE of authoring affordances. If a
 * future change re-adds create/edit/delete here, these tests must fail.
 */
test.describe('Admin Sport Rules (read-only)', () => {
  let testSetup: TestSetup;

  test.beforeEach(async ({ page }) => {
    testSetup = new TestSetup(page);
    await testSetup.signIn('admin');
    await testSetup.goToTemplateManagement();
  });

  test('displays the seeded sport rules', async ({ page }) => {
    await expect(page.locator('main h1')).toContainText('Sport Rules');
    await expect(page.getByRole('note', { name: /how sport rules are changed/i })).toContainText(
      /read-only/i
    );
  });

  test('offers no authoring controls', async ({ page }) => {
    for (const name of [
      /create template/i,
      /new template/i,
      /edit template/i,
      /test template/i,
      /import/i,
      /export/i,
      /advanced maintenance/i,
      /reload defaults/i,
      /reset templates/i,
      /clean duplicates/i,
    ]) {
      await expect(page.getByRole('button', { name })).toHaveCount(0);
    }
  });

  test('the removed authoring routes are gone', async ({ page }) => {
    for (const path of ['/admin/templates/new', '/admin/templates/template-1/edit']) {
      await page.goto(path);
      await page.waitForLoadState('domcontentloaded');
      // The route no longer resolves to an editor — no save affordance can appear.
      await expect(page.getByRole('button', { name: /save template/i })).toHaveCount(0);
    }
  });

  test('filters the seeded rules by registry', async ({ page }) => {
    const registryFilter = page.getByRole('combobox', { name: /filter by registry/i });
    await expect(registryFilter).toBeVisible();

    const searchBox = page.getByRole('textbox', { name: /search sport rules/i });
    await expect(searchBox).toBeVisible();

    // Searching for a string no seeded registry uses empties the grid.
    await searchBox.fill('zzzz-no-such-registry');
    await expect(page.getByText(/no sport rules match those filters/i)).toBeVisible();

    await page.getByRole('button', { name: /clear filters/i }).click();
    await expect(page.getByText(/no sport rules match those filters/i)).toHaveCount(0);
  });
});
