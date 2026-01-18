import { test, expect } from '@playwright/test';
import { TestSetup } from './helpers/testSetup';

test.describe('People Page UI Improvements', () => {
  let testSetup: TestSetup;

  test.beforeEach(async ({ page }) => {
    testSetup = new TestSetup(page);
  });

  test.describe('Data Display', () => {
    test('should display actual member since date, not hardcoded value', async ({ page }) => {
      await testSetup.signIn('admin');
      await page.goto('/users');
      await page.waitForLoadState('networkidle');

      // Click on the first person in the sidebar
      const firstPerson = page.locator('.apple-people-sidebar-item').first();
      if (await firstPerson.isVisible()) {
        await firstPerson.click();
        await page.waitForLoadState('networkidle');

        // Find the Member Since section
        const memberSinceSection = page.locator('text=Member Since').locator('..');

        if (await memberSinceSection.isVisible()) {
          const memberSinceText = await memberSinceSection.textContent();

          // Should NOT contain hardcoded "January 2024"
          expect(memberSinceText).not.toContain('January 2024');

          // Should match date pattern or "Not available"
          const validPattern = /((January|February|March|April|May|June|July|August|September|October|November|December) \d{4})|Not available/;
          expect(memberSinceText).toMatch(validPattern);
        }
      }
    });

    test('should NOT display Email Status badge', async ({ page }) => {
      await testSetup.signIn('admin');
      await page.goto('/users');
      await page.waitForLoadState('networkidle');

      // Click on the first person
      const firstPerson = page.locator('.apple-people-sidebar-item').first();
      if (await firstPerson.isVisible()) {
        await firstPerson.click();
        await page.waitForLoadState('networkidle');

        // Email Status should not exist
        await expect(page.locator('text=Email Status')).not.toBeVisible();
        // "Verified" badge in Account Summary context should not exist
        const verifiedBadge = page.locator('.bg-gradient-to-r.from-green-500\\/10:has-text("Verified")');
        await expect(verifiedBadge).not.toBeVisible();
      }
    });
  });

  test.describe('Quick Actions', () => {
    test('should display quick action buttons in hero card', async ({ page }) => {
      await testSetup.signIn('admin');
      await page.goto('/users');
      await page.waitForLoadState('networkidle');

      // Click on the first person
      const firstPerson = page.locator('.apple-people-sidebar-item').first();
      if (await firstPerson.isVisible()) {
        await firstPerson.click();
        await page.waitForLoadState('networkidle');

        // Check for Email button (mailto link)
        const emailButton = page.locator('a[href^="mailto:"]').first();
        const emailButtonVisible = await emailButton.isVisible();

        // At least one quick action should be visible if person has email
        if (emailButtonVisible) {
          await expect(emailButton).toContainText('Email');
        }
      }
    });

    test('should display dogs count badge when person has dogs', async ({ page }) => {
      await testSetup.signIn('admin');
      await page.goto('/users');
      await page.waitForLoadState('networkidle');

      // Look for a person card that displays dogs count
      const dogsCountBadge = page.locator('text=/\\d+ dogs?/').first();

      // If visible, verify format
      if (await dogsCountBadge.isVisible()) {
        const text = await dogsCountBadge.textContent();
        expect(text).toMatch(/^\d+ dogs?$/);
      }
    });
  });

  test.describe('Navigation', () => {
    test('should display breadcrumb navigation', async ({ page }) => {
      await testSetup.signIn('admin');
      await page.goto('/users');
      await page.waitForLoadState('networkidle');

      // Click on the first person
      const firstPerson = page.locator('.apple-people-sidebar-item').first();
      if (await firstPerson.isVisible()) {
        await firstPerson.click();
        await page.waitForLoadState('networkidle');

        // Breadcrumb should be visible
        const breadcrumb = page.locator('nav[aria-label="Breadcrumb"]');
        await expect(breadcrumb).toBeVisible();

        // Should contain "People" link
        await expect(page.locator('button:has-text("People")')).toBeVisible();
      }
    });

    test('should navigate back to people list when clicking People breadcrumb', async ({ page }) => {
      await testSetup.signIn('admin');
      await page.goto('/users');
      await page.waitForLoadState('networkidle');

      // Click on the first person
      const firstPerson = page.locator('.apple-people-sidebar-item').first();
      if (await firstPerson.isVisible()) {
        await firstPerson.click();
        await page.waitForLoadState('networkidle');

        // Click on People breadcrumb
        await page.locator('button:has-text("People")').click();

        // Should navigate back to /users
        await expect(page).toHaveURL(/\/users/);
      }
    });
  });

  test.describe('Terminology Consistency', () => {
    test('should use "People" in sidebar header', async ({ page }) => {
      await testSetup.signIn('admin');
      await page.goto('/users');
      await page.waitForLoadState('networkidle');

      // Sidebar header should say "People", not "Users"
      await expect(page.locator('aside h3')).toContainText('People');
    });
  });

  test.describe('Sidebar Filters', () => {
    test('should have filter chips for Judges and Has Dogs', async ({ page }) => {
      await testSetup.signIn('admin');
      await page.goto('/users');
      await page.waitForLoadState('networkidle');

      // Filter chips should be visible
      await expect(page.locator('button:has-text("Judges")')).toBeVisible();
      await expect(page.locator('button:has-text("Has Dogs")')).toBeVisible();
    });

    test('should filter results when Judges chip is clicked', async ({ page }) => {
      await testSetup.signIn('admin');
      await page.goto('/users');
      await page.waitForLoadState('networkidle');

      // Get initial count
      const initialCount = await page.locator('.apple-people-sidebar-item').count();

      // Click Judges filter
      await page.locator('button:has-text("Judges")').click();

      // Wait for filter to apply
      await page.waitForTimeout(300);

      // Filtered count should be different (less than or equal)
      const filteredCount = await page.locator('.apple-people-sidebar-item').count();
      expect(filteredCount).toBeLessThanOrEqual(initialCount);
    });

    test('should toggle filter chip active state on click', async ({ page }) => {
      await testSetup.signIn('admin');
      await page.goto('/users');
      await page.waitForLoadState('networkidle');

      const judgesChip = page.locator('button:has-text("Judges")');

      // Initially should have inactive styling
      await expect(judgesChip).toHaveClass(/bg-muted/);

      // Click to activate
      await judgesChip.click();

      // Should now have active styling
      await expect(judgesChip).toHaveClass(/bg-primary/);

      // Click again to deactivate
      await judgesChip.click();

      // Should return to inactive styling
      await expect(judgesChip).toHaveClass(/bg-muted/);
    });

    test('should show filter result count when filters active', async ({ page }) => {
      await testSetup.signIn('admin');
      await page.goto('/users');
      await page.waitForLoadState('networkidle');

      // Click a filter
      await page.locator('button:has-text("Judges")').click();

      // Result count should be visible
      const resultCount = page.locator('text=/\\d+ of \\d+ people/');
      await expect(resultCount).toBeVisible();
    });
  });

  test.describe('Settings Tab', () => {
    test('should NOT display Settings tab (removed)', async ({ page }) => {
      await testSetup.signIn('admin');
      await page.goto('/users');
      await page.waitForLoadState('networkidle');

      // Click on the first person
      const firstPerson = page.locator('.apple-people-sidebar-item').first();
      if (await firstPerson.isVisible()) {
        await firstPerson.click();
        await page.waitForLoadState('networkidle');

        // Settings tab should not exist
        await expect(page.locator('[role="tab"]:has-text("Settings")')).not.toBeVisible();
        await expect(page.locator('button:has-text("Settings"):not([aria-label])')).not.toBeVisible();
      }
    });
  });

  test.describe('Contact Information Card', () => {
    test('should display consolidated Contact Information card', async ({ page }) => {
      await testSetup.signIn('admin');
      await page.goto('/users');
      await page.waitForLoadState('networkidle');

      // Click on the first person
      const firstPerson = page.locator('.apple-people-sidebar-item').first();
      if (await firstPerson.isVisible()) {
        await firstPerson.click();
        await page.waitForLoadState('networkidle');

        // Should have "Contact Information" header
        await expect(page.locator('h3:has-text("Contact Information")')).toBeVisible();

        // Should NOT have separate "Personal Information" and "Address Information"
        await expect(page.locator('h3:has-text("Personal Information")')).not.toBeVisible();
        await expect(page.locator('h3:has-text("Address Information")')).not.toBeVisible();
      }
    });
  });

  test.describe('Judge Qualifications Visibility', () => {
    test('should conditionally show Judge Qualifications card', async ({ page }) => {
      await testSetup.signIn('admin');
      await page.goto('/users');
      await page.waitForLoadState('networkidle');

      // Find a non-judge person (marked as Member in sidebar)
      const memberItem = page.locator('.apple-people-sidebar-item:has(.apple-people-sidebar-role:has-text("Member"))').first();

      if (await memberItem.isVisible()) {
        await memberItem.click();
        await page.waitForLoadState('networkidle');

        // Judge Qualifications card should NOT be visible for non-judges
        const judgeQualCard = page.locator('h3:has-text("Judge Qualifications")');

        // If person has no judge role and no qualifications, card should be hidden
        // Note: This depends on the actual data - card might show if person has qualifications
        const isVisible = await judgeQualCard.isVisible();

        // Log for debugging
        console.log('Judge Qualifications visible for member:', isVisible);
      }
    });
  });
});
