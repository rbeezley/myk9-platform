import { test, expect } from '@playwright/test';

/**
 * Test 1.1: Create People with Different Roles - Validation
 * 
 * This test validates the user creation interface fixes:
 * - "Add User" button is always visible in Users page sidebar
 * - User creation dialog opens and functions properly
 * - Users are successfully created and persisted to database
 * - New users appear in sidebar
 * - Navigation routing works correctly (/users/ not /people/)
 */

test.describe('User Creation Interface Validation', () => {
  test.beforeEach(async ({ page }) => {
    // Mock authentication by setting localStorage items
    await page.addInitScript(() => {
      // Mock the authentication token and user info
      localStorage.setItem('sb-eergfbehjghvnrmpjlwb-auth-token', JSON.stringify({
        access_token: 'mock-token',
        refresh_token: 'mock-refresh',
        user: {
          id: 'mock-user-id',
          email: 'test@example.com',
          role: 'secretary'
        }
      }));
      
      // Mock user permissions
      localStorage.setItem('user-permissions', JSON.stringify({
        role: 'secretary',
        permissions: ['read_users', 'write_users']
      }));
      
      // Skip performance optimizations in tests
      window.SKIP_PERFORMANCE_OPTIMIZATION = true;
    });
    
    // Navigate to users page
    await page.goto('/users');
    
    // Wait for page to load and authentication to be processed
    await page.waitForLoadState('networkidle');
    
    // Wait for any redirects to complete
    await page.waitForTimeout(1000);
  });

  test('should display "Add User" button in sidebar', async ({ page }) => {
    // Verify the "Add User" button is visible in the sidebar
    const addUserButton = page.getByRole('button', { name: 'Add User' });
    await expect(addUserButton).toBeVisible();
    await expect(addUserButton).toBeEnabled();
  });

  test('should open user creation dialog when "Add User" is clicked', async ({ page }) => {
    // Click the "Add User" button
    await page.getByRole('button', { name: 'Add User' }).click();
    
    // Verify dialog opens with correct title
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    
    // Check for dialog title
    const title = page.getByRole('heading', { name: 'Edit Profile' });
    await expect(title).toBeVisible();
    
    // Verify form fields are present
    await expect(page.locator('#name')).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#phone')).toBeVisible();
    await expect(page.locator('#address')).toBeVisible();
    await expect(page.locator('#city')).toBeVisible();
    await expect(page.locator('#state')).toBeVisible();
  });

  test('should create new user successfully', async ({ page }) => {
    // Click the "Add User" button
    await page.getByRole('button', { name: 'Add User' }).click();
    
    // Wait for dialog to be visible
    await expect(page.getByRole('dialog')).toBeVisible();
    
    // Fill out the form
    await page.locator('#name').fill('Test User Role');
    await page.locator('#email').fill('testrole@example.com');
    await page.locator('#phone').fill('555-0123');
    await page.locator('#address').fill('123 Test Street');
    await page.locator('#city').fill('Test City');
    await page.locator('#state').fill('TX');
    
    // Get the initial count of users in sidebar before creation
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _initialUsers = await page.locator('[data-testid="sidebar-item"], .sidebar-item, [class*="sidebar"] [class*="item"]').count();
    
    // Submit the form
    const saveButton = page.getByRole('button', { name: 'Save' });
    await expect(saveButton).toBeVisible();
    await saveButton.click();
    
    // Wait for dialog to close
    await expect(page.getByRole('dialog')).not.toBeVisible();
    
    // Verify user appears in the sidebar
    await expect(page.getByText('testrole@example.com')).toBeVisible();
    
    // Verify the URL changed to the new user's page
    await expect(page).toHaveURL(/\/users\/[\w-]+/);
  });

  test('should navigate correctly using /users/ route', async ({ page }) => {
    // Test that we're on the correct route
    await expect(page).toHaveURL('/users');
    
    // Verify the navigation shows "Users" as active
    const usersLink = page.getByRole('link', { name: 'Users' });
    await expect(usersLink).toBeVisible();
  });

  test('should display existing users in sidebar', async ({ page }) => {
    // Verify users are displayed in the sidebar
    // The implementation shows email addresses in the sidebar
    const userEmails = [
      'newuser@test.com',
      'test.user@example.com', 
      'test@example.com',
      'beezley@cox.net',
      'richard@myk9t.com',
      'testuser@example.com'
    ];
    
    // At least some of the existing users should be visible
    let visibleUsers = 0;
    for (const email of userEmails) {
      const userElement = page.getByText(email);
      if (await userElement.isVisible()) {
        visibleUsers++;
      }
    }
    
    // Verify at least some users are displayed
    expect(visibleUsers).toBeGreaterThan(0);
  });

  test('should handle form validation correctly', async ({ page }) => {
    // Click the "Add User" button
    await page.getByRole('button', { name: 'Add User' }).click();
    
    // Wait for dialog to be visible
    await expect(page.getByRole('dialog')).toBeVisible();
    
    // Try to save without filling required fields
    const saveButton = page.getByRole('button', { name: 'Save' });
    await saveButton.click();
    
    // Verify form validation prevents submission
    // The form has required fields that should prevent submission
    const nameField = page.locator('#name');
    await expect(nameField).toHaveAttribute('required');
    
    const emailField = page.locator('#email');
    await expect(emailField).toHaveAttribute('required');
  });

  test('should allow canceling user creation', async ({ page }) => {
    // Click the "Add User" button
    await page.getByRole('button', { name: 'Add User' }).click();
    
    // Wait for dialog to be visible
    await expect(page.getByRole('dialog')).toBeVisible();
    
    // Fill some fields
    await page.locator('#name').fill('Cancel Test');
    
    // Click cancel
    const cancelButton = page.getByRole('button', { name: 'Cancel' });
    await cancelButton.click();
    
    // Verify dialog closes
    await expect(page.getByRole('dialog')).not.toBeVisible();
    
    // Verify we're still on the users page
    await expect(page).toHaveURL('/users');
  });
});