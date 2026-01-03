import { test, expect } from '@playwright/test';

// Test configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';


test.describe('Cross-Role Workflows', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
  });

  test.describe('Entry Management Workflow', () => {
    test('complete entry lifecycle from exhibitor submission to judge assignment', async ({ page, context }) => {
      // Step 1: Exhibitor submits entry
      test.step('Exhibitor creates show entry', async () => {
        await page.goto(`${BASE_URL}/shows/browse`);
        
        // Wait for page to load
        await expect(page.locator('h1')).toContainText('Browse Shows');
        
        // Find and select a show
        await page.locator('[data-testid="show-card"]').first().click();
        await page.locator('[data-testid="enter-show-button"]').click();
        
        // Fill out entry form
        await page.locator('[data-testid="dog-select"]').selectOption('dog_1');
        await page.locator('[data-testid="class-checkbox"]').first().check();
        
        // Submit entry
        await page.locator('[data-testid="submit-entry"]').click();
        
        // Verify submission success
        await expect(page.locator('[data-testid="success-message"]')).toContainText('Entry submitted successfully');
      });

      // Step 2: Secretary reviews and processes entry
      test.step('Secretary processes entry', async () => {
        // Open new tab for secretary
        const secretaryPage = await context.newPage();
        await secretaryPage.goto(`${BASE_URL}/secretary/dashboard`);
        
        // Navigate to entry management
        await secretaryPage.locator('[data-testid="entry-management-link"]').click();
        
        // Wait for entries to load
        await expect(secretaryPage.locator('h1')).toContainText('Entry Management');
        
        // Find pending entry
        await secretaryPage.locator('[data-testid="pending-tab"]').click();
        await expect(secretaryPage.locator('[data-testid="entry-row"]')).toHaveCount(1);
        
        // Accept the entry
        await secretaryPage.locator('[data-testid="accept-entry-button"]').first().click();
        
        // Verify entry status changed
        await secretaryPage.locator('[data-testid="accepted-tab"]').click();
        await expect(secretaryPage.locator('[data-testid="entry-row"]')).toHaveCount(1);
        
        await secretaryPage.close();
      });

      // Step 3: Judge receives assignment
      test.step('Judge views assignment', async () => {
        const judgePage = await context.newPage();
        await judgePage.goto(`${BASE_URL}/judge/dashboard`);
        
        // Wait for dashboard to load
        await expect(judgePage.locator('h1')).toContainText('Judge Dashboard');
        
        // Check for new assignments
        await expect(judgePage.locator('[data-testid="assignment-card"]')).toBeVisible();
        await expect(judgePage.locator('[data-testid="entry-count"]')).toContainText('1');
        
        await judgePage.close();
      });

      // Step 4: Exhibitor receives notification
      test.step('Exhibitor receives entry acceptance notification', async () => {
        await page.goto(`${BASE_URL}/my-entries`);
        
        // Wait for entries to load
        await expect(page.locator('h1')).toContainText('My Entries');
        
        // Check entry status
        await expect(page.locator('[data-testid="entry-status-badge"]')).toContainText('Accepted');
        
        // Check notification center
        await page.locator('[data-testid="notification-button"]').click();
        await expect(page.locator('[data-testid="notification-item"]')).toContainText('Entry Accepted');
      });
    });

    test('entry rejection workflow with notifications', async ({ page, context }) => {
      test.step('Secretary rejects entry with reason', async () => {
        await page.goto(`${BASE_URL}/secretary/dashboard`);
        await page.locator('[data-testid="entry-management-link"]').click();
        
        // Find pending entry
        await page.locator('[data-testid="pending-tab"]').click();
        
        // Reject entry with reason
        await page.locator('[data-testid="entry-actions-menu"]').first().click();
        await page.locator('[data-testid="reject-entry"]').click();
        
        // Fill rejection reason
        await page.locator('[data-testid="rejection-reason"]').fill('Class is full');
        await page.locator('[data-testid="confirm-rejection"]').click();
        
        // Verify rejection
        await expect(page.locator('[data-testid="success-message"]')).toContainText('Entry rejected');
      });

      test.step('Exhibitor receives rejection notification', async () => {
        const exhibitorPage = await context.newPage();
        await exhibitorPage.goto(`${BASE_URL}/my-entries`);
        
        // Check entry status
        await expect(exhibitorPage.locator('[data-testid="entry-status-badge"]')).toContainText('Rejected');
        
        // Check notification
        await exhibitorPage.locator('[data-testid="notification-button"]').click();
        await expect(exhibitorPage.locator('[data-testid="notification-item"]')).toContainText('Entry Status Update');
        await expect(exhibitorPage.locator('[data-testid="notification-body"]')).toContainText('Class is full');
        
        await exhibitorPage.close();
      });
    });
  });

  test.describe('Real-time Communication', () => {
    test('schedule changes propagate to all affected users', async ({ page, context }) => {
      test.step('Secretary makes schedule change', async () => {
        await page.goto(`${BASE_URL}/secretary/dashboard`);
        
        // Navigate to schedule management
        await page.locator('[data-testid="schedule-management"]').click();
        
        // Change class time
        await page.locator('[data-testid="class-schedule-edit"]').first().click();
        await page.locator('[data-testid="new-time-input"]').fill('10:30 AM');
        await page.locator('[data-testid="save-schedule"]').click();
        
        // Verify change saved
        await expect(page.locator('[data-testid="success-message"]')).toContainText('Schedule updated');
      });

      test.step('Judge receives schedule notification', async () => {
        const judgePage = await context.newPage();
        await judgePage.goto(`${BASE_URL}/judge/dashboard`);
        
        // Wait for real-time notification
        await expect(judgePage.locator('[data-testid="notification-toast"]')).toContainText('Schedule Change');
        
        // Check updated assignment
        await expect(judgePage.locator('[data-testid="assignment-time"]')).toContainText('10:30 AM');
        
        await judgePage.close();
      });

      test.step('Exhibitor receives schedule notification', async () => {
        const exhibitorPage = await context.newPage();
        await exhibitorPage.goto(`${BASE_URL}/my-entries`);
        
        // Check for schedule change notification
        await exhibitorPage.locator('[data-testid="notification-button"]').click();
        await expect(exhibitorPage.locator('[data-testid="notification-item"]')).toContainText('Schedule Change');
        
        await exhibitorPage.close();
      });
    });
  });

  test.describe('Search and Filtering', () => {
    test('advanced search across different user contexts', async ({ page }) => {
      test.step('Exhibitor searches shows with filters', async () => {
        await page.goto(`${BASE_URL}/shows/browse`);
        
        // Open advanced search
        await page.locator('[data-testid="advanced-search-toggle"]').click();
        
        // Apply filters
        await page.locator('[data-testid="location-filter"]').selectOption('Colorado');
        await page.locator('[data-testid="date-filter-start"]').fill('2024-07-01');
        await page.locator('[data-testid="search-button"]').click();
        
        // Verify filtered results
        await expect(page.locator('[data-testid="search-results"]')).toBeVisible();
        await expect(page.locator('[data-testid="result-count"]')).toContainText('results');
      });

      test.step('Search suggestions work correctly', async () => {
        // Type in search box
        await page.locator('[data-testid="search-input"]').fill('agil');
        
        // Wait for suggestions
        await expect(page.locator('[data-testid="search-suggestions"]')).toBeVisible();
        await expect(page.locator('[data-testid="suggestion-item"]')).toContainText('agility');
        
        // Select suggestion
        await page.locator('[data-testid="suggestion-item"]').first().click();
        await expect(page.locator('[data-testid="search-input"]')).toHaveValue('agility');
      });
    });

    test('search history persists across sessions', async ({ page }) => {
      test.step('Perform search to create history', async () => {
        await page.goto(`${BASE_URL}/shows/browse`);
        
        await page.locator('[data-testid="search-input"]').fill('agility championship');
        await page.locator('[data-testid="search-button"]').click();
        
        // Wait for results
        await expect(page.locator('[data-testid="search-results"]')).toBeVisible();
      });

      test.step('Search history appears in new session', async () => {
        // Simulate new session by refreshing page
        await page.reload();
        
        // Click on search input to show history
        await page.locator('[data-testid="search-input"]').click();
        
        // Verify history is shown
        await expect(page.locator('[data-testid="search-history"]')).toBeVisible();
        await expect(page.locator('[data-testid="history-item"]')).toContainText('agility championship');
      });
    });
  });

  test.describe('Notification Center', () => {
    test('notification center functionality across roles', async ({ page }) => {
      test.step('Admin sends announcement notification', async () => {
        await page.goto(`${BASE_URL}/admin/dashboard`);
        
        // Create announcement
        await page.locator('[data-testid="create-announcement"]').click();
        await page.locator('[data-testid="announcement-title"]').fill('Important Update');
        await page.locator('[data-testid="announcement-body"]').fill('New COVID protocols in effect');
        await page.locator('[data-testid="send-announcement"]').click();
        
        await expect(page.locator('[data-testid="success-message"]')).toContainText('Announcement sent');
      });

      test.step('Users receive and manage notifications', async () => {
        const userPage = await context.newPage();
        await userPage.goto(`${BASE_URL}/my-entries`);
        
        // Check notification bell
        await expect(userPage.locator('[data-testid="notification-badge"]')).toContainText('1');
        
        // Open notification center
        await userPage.locator('[data-testid="notification-button"]').click();
        await expect(userPage.locator('[data-testid="notification-center"]')).toBeVisible();
        
        // Check announcement notification
        await expect(userPage.locator('[data-testid="notification-item"]')).toContainText('Important Update');
        
        // Mark as read
        await userPage.locator('[data-testid="mark-read-button"]').first().click();
        await expect(userPage.locator('[data-testid="notification-badge"]')).not.toBeVisible();
        
        // Test notification filtering
        await userPage.locator('[data-testid="filter-dropdown"]').selectOption('announcements');
        await expect(userPage.locator('[data-testid="notification-item"]')).toHaveCount(1);
        
        await userPage.close();
      });
    });

    test('notification preferences affect delivery', async ({ page }) => {
      test.step('User updates notification preferences', async () => {
        await page.goto(`${BASE_URL}/settings/notifications`);
        
        // Disable entry update notifications
        await page.locator('[data-testid="entry-updates-toggle"]').uncheck();
        await page.locator('[data-testid="save-preferences"]').click();
        
        await expect(page.locator('[data-testid="success-message"]')).toContainText('Preferences saved');
      });

      test.step('User does not receive disabled notification types', async () => {
        // This would require actual backend integration to fully test
        // For now, verify preference is saved
        await page.reload();
        await expect(page.locator('[data-testid="entry-updates-toggle"]')).not.toBeChecked();
      });
    });
  });

  test.describe('Offline Functionality', () => {
    test('app works offline with cached data', async ({ page, context }) => {
      test.step('Load data while online', async () => {
        await page.goto(`${BASE_URL}/my-entries`);
        await expect(page.locator('h1')).toContainText('My Entries');
        
        // Ensure data is loaded
        await expect(page.locator('[data-testid="entry-card"]')).toBeVisible();
      });

      test.step('App continues to work offline', async () => {
        // Simulate offline mode
        await context.setOffline(true);
        
        // Refresh page
        await page.reload();
        
        // Should still show cached content
        await expect(page.locator('h1')).toContainText('My Entries');
        await expect(page.locator('[data-testid="offline-indicator"]')).toBeVisible();
      });

      test.step('Offline actions queue for sync', async () => {
        // Try to perform an action while offline
        await page.locator('[data-testid="entry-actions-menu"]').first().click();
        await page.locator('[data-testid="scratch-entry"]').click();
        
        // Should show queued action message
        await expect(page.locator('[data-testid="queued-message"]')).toContainText('Action queued for when online');
        
        // Go back online
        await context.setOffline(false);
        
        // Should sync queued actions
        await expect(page.locator('[data-testid="sync-complete"]')).toBeVisible();
      });
    });
  });

  test.describe('Performance and Accessibility', () => {
    test('pages load within performance budget', async ({ page }) => {
      const startTime = Date.now();
      
      await page.goto(`${BASE_URL}/shows/browse`);
      await expect(page.locator('h1')).toContainText('Browse Shows');
      
      const loadTime = Date.now() - startTime;
      
      // Performance budget: page should load within 3 seconds
      expect(loadTime).toBeLessThan(3000);
    });

    test('app is accessible with keyboard navigation', async ({ page }) => {
      await page.goto(`${BASE_URL}/shows/browse`);
      
      // Test keyboard navigation
      await page.keyboard.press('Tab');
      await expect(page.locator(':focus')).toBeVisible();
      
      // Test skip links
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      
      // Should focus on main content
      await expect(page.locator('main :focus')).toBeVisible();
    });

    test('app works with screen reader', async ({ page }) => {
      await page.goto(`${BASE_URL}/my-entries`);
      
      // Check for proper ARIA labels
      await expect(page.locator('[aria-label]')).toHaveCount.toBeGreaterThan(0);
      
      // Check for proper heading structure
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator('h2, h3, h4')).toHaveCount.toBeGreaterThan(0);
      
      // Check for alt text on images
      const images = page.locator('img');
      const imageCount = await images.count();
      
      if (imageCount > 0) {
        for (let i = 0; i < imageCount; i++) {
          await expect(images.nth(i)).toHaveAttribute('alt');
        }
      }
    });
  });

  test.describe('Error Handling', () => {
    test('app handles network errors gracefully', async ({ page, context }) => {
      await page.goto(`${BASE_URL}/my-entries`);
      
      // Simulate network failure
      await context.route('**/api/**', (route) => {
        route.abort('failed');
      });
      
      // Try to perform an action that requires network
      await page.locator('[data-testid="refresh-button"]').click();
      
      // Should show error message
      await expect(page.locator('[data-testid="error-message"]')).toContainText('network');
      
      // Should offer retry option
      await expect(page.locator('[data-testid="retry-button"]')).toBeVisible();
    });

    test('app handles authentication errors', async ({ page, context }) => {
      await page.goto(`${BASE_URL}/my-entries`);
      
      // Simulate authentication failure
      await context.route('**/api/**', (route) => {
        route.fulfill({
          status: 401,
          body: JSON.stringify({ error: 'Unauthorized' })
        });
      });
      
      // Try to access protected resource
      await page.locator('[data-testid="refresh-button"]').click();
      
      // Should redirect to login or show auth error
      await expect(page.locator('[data-testid="auth-error"]')).toBeVisible();
    });
  });
});

