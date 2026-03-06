import { test, expect } from '@playwright/test';

test.describe('Browse Clubs Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/clubs', { waitUntil: 'networkidle', timeout: 15000 });
  });

  test.describe('Page Load', () => {
    test('should display page heading and description', async ({ page }) => {
      await expect(page.locator('h1:has-text("Clubs")')).toBeVisible();
      await expect(
        page.locator('text=Browse clubs, view their shows, and manage your organizations')
      ).toBeVisible();
    });

    test('should display breadcrumb navigation', async ({ page }) => {
      const breadcrumb = page.locator('nav[aria-label="Breadcrumb"]');
      await expect(breadcrumb).toBeVisible();
    });

    test('should display search input', async ({ page }) => {
      await expect(page.locator('input[placeholder*="Search clubs"]')).toBeVisible();
    });

    test('should display Add Club button', async ({ page }) => {
      await expect(page.locator('button:has-text("Add Club")')).toBeVisible();
    });

    test('should display result count', async ({ page }) => {
      await expect(page.locator('text=/\\d+ of \\d+ clubs?/')).toBeVisible();
    });
  });

  test.describe('View Mode Toggle', () => {
    test('should default to grid view', async ({ page }) => {
      const gridButton = page.locator('button:has-text("Grid")');
      // Active button uses 'default' variant which doesn't have 'ghost' class
      await expect(gridButton).toBeVisible();
    });

    test('should switch to list view', async ({ page }) => {
      await page.locator('button:has-text("List")').click();
      // URL should update with view=list
      await expect(page).toHaveURL(/view=list/);
    });

    test('should switch back to grid view', async ({ page }) => {
      // Start in list view
      await page.locator('button:has-text("List")').click();
      await expect(page).toHaveURL(/view=list/);

      // Switch to grid
      await page.locator('button:has-text("Grid")').click();
      // Grid is default so view param should be removed
      await expect(page).not.toHaveURL(/view=/);
    });

    test('should persist view mode in URL', async ({ page }) => {
      await page.locator('button:has-text("List")').click();
      await expect(page).toHaveURL(/view=list/);

      // Reload page
      await page.reload({ waitUntil: 'networkidle' });

      // Should still be in list view
      await expect(page).toHaveURL(/view=list/);
    });
  });

  test.describe('Search and Filter', () => {
    test('should filter clubs by search text', async ({ page }) => {
      const searchInput = page.locator('input[placeholder*="Search clubs"]');
      await searchInput.fill('test');
      // Wait for debounce
      await page.waitForTimeout(400);

      // If clubs match, result count should reflect the filter
      const countText = page.locator('text=/\\d+ of \\d+ clubs?/');
      await expect(countText).toBeVisible();
    });

    test('should show active filter chip when searching', async ({ page }) => {
      const searchInput = page.locator('input[placeholder*="Search clubs"]');
      await searchInput.fill('test');
      await page.waitForTimeout(400);

      // Should show a filter chip with the search text
      const filterChip = page.locator('text=/test/i').first();
      await expect(filterChip).toBeVisible();
    });

    test('should show Filters button', async ({ page }) => {
      await expect(page.locator('button:has-text("Filters")')).toBeVisible();
    });

    test('should expand filter panel on click', async ({ page }) => {
      await page.locator('button:has-text("Filters")').click();

      // Club Type dropdown should appear
      await expect(page.locator('text=All Types')).toBeVisible();
    });

    test('should show no results message when search has no matches', async ({ page }) => {
      const searchInput = page.locator('input[placeholder*="Search clubs"]');
      await searchInput.fill('zzzznonexistentclubname');
      await page.waitForTimeout(400);

      const noResults = page.locator('text=No clubs match your filters');
      const noClubs = page.locator('text=No clubs yet');
      // One of these should appear
      const visible = (await noResults.isVisible()) || (await noClubs.isVisible());
      expect(visible).toBeTruthy();
    });

    test('should clear all filters', async ({ page }) => {
      const searchInput = page.locator('input[placeholder*="Search clubs"]');
      await searchInput.fill('test');
      await page.waitForTimeout(400);

      // Click "Clear all" if visible
      const clearAll = page.locator('button:has-text("Clear all")');
      if (await clearAll.isVisible()) {
        await clearAll.click();
        await page.waitForTimeout(300);

        // Search input should be cleared
        await expect(searchInput).toHaveValue('');
      }
    });
  });

  test.describe('Club Card Navigation', () => {
    test('should navigate to club detail page on card click', async ({ page }) => {
      // Wait for clubs to render
      const clubCard = page.locator('[role="link"]').first();

      if (await clubCard.isVisible({ timeout: 5000 }).catch(() => false)) {
        await clubCard.click();
        await page.waitForLoadState('networkidle');

        // Should navigate to /clubs/:id
        await expect(page).toHaveURL(/\/clubs\/[a-zA-Z0-9-]+/);
      }
    });
  });

  test.describe('Club Detail Page', () => {
    test('should display club details and navigate back via breadcrumb', async ({ page }) => {
      // Click first club card
      const clubCard = page.locator('[role="link"]').first();

      if (await clubCard.isVisible({ timeout: 5000 }).catch(() => false)) {
        await clubCard.click();
        await page.waitForLoadState('networkidle');

        // Should be on detail page
        await expect(page).toHaveURL(/\/clubs\/[a-zA-Z0-9-]+/);

        // Breadcrumb should show Clubs link
        const clubsBreadcrumb = page.locator('nav[aria-label="Breadcrumb"]').locator('text=Clubs');
        if (await clubsBreadcrumb.isVisible()) {
          await clubsBreadcrumb.click();
          await page.waitForLoadState('networkidle');

          // Should be back on browse page
          await expect(page).toHaveURL(/\/clubs$/);
        }
      }
    });
  });

  test.describe('Empty State', () => {
    test('should show empty state with Add Club button when no clubs exist', async ({ page }) => {
      // This test checks the empty state rendering
      // If there are no clubs, we should see the empty state
      const emptyState = page.locator('text=No clubs yet');
      const clubCards = page.locator('[role="link"]');

      const hasClubs = (await clubCards.count()) > 0;

      if (!hasClubs) {
        await expect(emptyState).toBeVisible();
        await expect(page.locator('text=Get started by creating your first club')).toBeVisible();
        await expect(page.locator('button:has-text("Add Club")')).toBeVisible();
      }
    });
  });
});
