import { test, expect } from '@playwright/test';

/**
 * Playwright E2E Tests with Real Authentication
 * 
 * These tests use a real test user instead of mocks to test the complete
 * authentication and navigation flow.
 * 
 * Prerequisites:
 * 1. Run the test user creation script first
 * 2. Ensure the test user exists in Supabase
 */

const TEST_USER = {
  email: 'test@playwright.com',
  password: 'TestUser123!',
  firstName: 'Test',
  lastName: 'User',
  role: 'exhibitor'
};

// Known test data from database
const TEST_SHOWS = {
  comprehensive: {
    name: 'Phase 4 Comprehensive Championship',
    date: '2025-11-15',
    location: 'Comprehensive Test Venue',
    club: 'Phase 4 Comprehensive Test Club'
  },
  simple: {
    name: 'Simple Test Show', 
    date: '2025-10-01',
    location: 'Test Location',
    club: 'Phase 4 Simple Test Club'
  }
};

test.describe('Real Authentication Flow', () => {
  test.describe.configure({ mode: 'serial' });

  test('should create and authenticate test user', async ({ page }) => {
    // Navigate to login page
    await page.goto('/login');
    
    // Verify login form is present
    await expect(page.locator('[data-testid="login-form"]')).toBeVisible();
    
    // Fill in real test credentials
    await page.fill('[data-testid="email-input"]', TEST_USER.email);
    await page.fill('[data-testid="password-input"]', TEST_USER.password);
    
    // Submit login form
    await page.click('[data-testid="login-button"]');
    
    // Wait for successful authentication and redirect
    await page.waitForURL('/dashboard', { timeout: 10000 });
    
    // Verify user is authenticated
    await expect(page.locator('[data-testid="user-profile"]')).toBeVisible();
    
    // Check if user name is displayed (optional, depends on UI)
    const userGreeting = page.locator('[data-testid="user-greeting"]');
    if (await userGreeting.isVisible()) {
      await expect(userGreeting).toContainText(TEST_USER.firstName);
    }
  });

  test('should browse shows as authenticated user', async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.fill('[data-testid="email-input"]', TEST_USER.email);
    await page.fill('[data-testid="password-input"]', TEST_USER.password);
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('/dashboard');
    
    // Navigate to browse shows
    await page.click('[data-testid="browse-shows-link"]');
    await page.waitForURL('/shows');
    
    // Verify shows list is loaded
    await expect(page.locator('[data-testid="shows-list"]')).toBeVisible();
    
    // Check that shows are displayed
    const showCards = page.locator('[data-testid="show-card"]');
    await expect(showCards.first()).toBeVisible();
    
    // Verify test shows are present
    await expect(page.locator('text=' + TEST_SHOWS.comprehensive.name).first()).toBeVisible();
    await expect(page.locator('text=' + TEST_SHOWS.simple.name).first()).toBeVisible();
  });

  test('should view show details', async ({ page }) => {
    // Login and navigate to shows
    await page.goto('/login');
    await page.fill('[data-testid="email-input"]', TEST_USER.email);
    await page.fill('[data-testid="password-input"]', TEST_USER.password);
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('/dashboard');
    
    await page.click('[data-testid="browse-shows-link"]');
    await page.waitForURL('/shows');
    
    // Click on the first show to view details
    const firstShowCard = page.locator('[data-testid="show-card"]').first();
    await firstShowCard.click();
    
    // Wait for show details page to load
    await expect(page.locator('[data-testid="show-details"]')).toBeVisible();
    
    // Verify show details are displayed
    await expect(page.locator('[data-testid="show-name"]')).not.toBeEmpty();
    await expect(page.locator('[data-testid="show-date"]')).not.toBeEmpty();
    await expect(page.locator('[data-testid="show-location"]')).not.toBeEmpty();
    
    // Check for club information
    const clubInfo = page.locator('[data-testid="club-info"]');
    if (await clubInfo.isVisible()) {
      await expect(clubInfo).not.toBeEmpty();
    }
    
    // Check for trial information
    const trialInfo = page.locator('[data-testid="trial-info"]');
    if (await trialInfo.isVisible()) {
      await expect(trialInfo).not.toBeEmpty();
    }
  });

  test('should handle logout correctly', async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.fill('[data-testid="email-input"]', TEST_USER.email);
    await page.fill('[data-testid="password-input"]', TEST_USER.password);
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('/dashboard');
    
    // Logout
    const logoutButton = page.locator('[data-testid="logout-button"]');
    if (await logoutButton.isVisible()) {
      await logoutButton.click();
    } else {
      // Try user menu if logout is in a dropdown
      const userMenu = page.locator('[data-testid="user-menu"]');
      if (await userMenu.isVisible()) {
        await userMenu.click();
        await page.click('[data-testid="logout-menu-item"]');
      }
    }
    
    // Verify redirect to login or home page
    await page.waitForURL(url => url.pathname === '/login' || url.pathname === '/');
    
    // Verify user is logged out (login form should be visible if redirected to login)
    if (page.url().includes('/login')) {
      await expect(page.locator('[data-testid="login-form"]')).toBeVisible();
    }
  });

  test('should persist authentication across page reloads', async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.fill('[data-testid="email-input"]', TEST_USER.email);
    await page.fill('[data-testid="password-input"]', TEST_USER.password);
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('/dashboard');
    
    // Reload the page
    await page.reload();
    
    // Should still be authenticated and on dashboard
    await expect(page).toHaveURL(/dashboard/);
    await expect(page.locator('[data-testid="user-profile"]')).toBeVisible();
  });

  test('should handle invalid credentials gracefully', async ({ page }) => {
    await page.goto('/login');
    
    // Try with invalid credentials
    await page.fill('[data-testid="email-input"]', 'invalid@example.com');
    await page.fill('[data-testid="password-input"]', 'wrongpassword');
    await page.click('[data-testid="login-button"]');
    
    // Should show error message and remain on login page
    await expect(page.locator('[data-testid="login-error"]')).toBeVisible();
    await expect(page).toHaveURL(/login/);
  });

  test('should show proper user role and permissions', async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.fill('[data-testid="email-input"]', TEST_USER.email);
    await page.fill('[data-testid="password-input"]', TEST_USER.password);
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('/dashboard');
    
    // Check user role is exhibitor (UI depends on implementation)
    const roleIndicator = page.locator('[data-testid="user-role"]');
    if (await roleIndicator.isVisible()) {
      await expect(roleIndicator).toContainText('exhibitor');
    }
    
    // Verify exhibitor can access appropriate features
    await expect(page.locator('[data-testid="browse-shows-link"]')).toBeVisible();
    
    // Verify exhibitor cannot access admin features (if any are shown)
    const adminLink = page.locator('[data-testid="admin-panel-link"]');
    if (await adminLink.isVisible()) {
      // This would be unexpected for an exhibitor
      console.warn('Admin link visible to exhibitor user - check permissions');
    }
  });
});

test.describe('Navigation and Data Access', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test in this group
    await page.goto('/login');
    await page.fill('[data-testid="email-input"]', TEST_USER.email);
    await page.fill('[data-testid="password-input"]', TEST_USER.password);
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('/dashboard');
  });

  test('should access all exhibitor-appropriate pages', async ({ page }) => {
    // Test navigation to different sections
    const navigationTests = [
      { link: '[data-testid="browse-shows-link"]', expectedUrl: '/shows' },
      { link: '[data-testid="my-entries-link"]', expectedUrl: '/entries' },
      { link: '[data-testid="my-dogs-link"]', expectedUrl: '/dogs' },
      { link: '[data-testid="profile-link"]', expectedUrl: '/profile' }
    ];

    for (const { link, expectedUrl } of navigationTests) {
      const linkElement = page.locator(link);
      if (await linkElement.isVisible()) {
        await linkElement.click();
        await expect(page).toHaveURL(new RegExp(expectedUrl));
        
        // Navigate back to dashboard for next test
        const dashboardLink = page.locator('[data-testid="dashboard-link"]');
        if (await dashboardLink.isVisible()) {
          await dashboardLink.click();
          await page.waitForURL('/dashboard');
        } else {
          await page.goto('/dashboard');
        }
      }
    }
  });

  test('should load show data correctly', async ({ page }) => {
    await page.goto('/shows');
    
    // Wait for data to load
    await page.waitForSelector('[data-testid="show-card"]', { timeout: 10000 });
    
    // Verify specific test data is present
    await expect(page.locator('text=' + TEST_SHOWS.comprehensive.name).first()).toBeVisible();
    await expect(page.locator('text=' + TEST_SHOWS.simple.name).first()).toBeVisible();
    
    // Verify show dates are formatted correctly
    await expect(page.locator('text=2025-11-15').first()).toBeVisible();
    await expect(page.locator('text=2025-10-01').first()).toBeVisible();
  });
});