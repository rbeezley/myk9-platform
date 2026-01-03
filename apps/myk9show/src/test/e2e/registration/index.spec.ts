import { test, expect } from '@playwright/test';
import { TestSetup } from '../helpers/testSetup';

test.describe('Registration Workflow Integration', () => {
  let testSetup: TestSetup;

  test.beforeEach(async ({ page }) => {
    testSetup = new TestSetup(page);
    await testSetup.clearTestData();
    await testSetup.mockApiResponses();
  });

  test('should run smoke test across all user scenarios', async ({ page }) => {
    // Test 1: Exhibitor workflow
    await testSetup.signIn('user');
    await page.goto('/shows/show-123/register');
    
    // Quick exhibitor registration
    await page.click('[data-testid="dog-card-1"] [data-testid="select-dog-button"]');
    await page.click('[data-testid="next-step-button"]');
    await page.click('[data-testid="class-option-novice-standard"]');
    await page.click('[data-testid="next-step-button"]');
    await page.click('[data-testid="payment-method-check"]');
    await page.fill('[data-testid="check-number-input"]', '1001');
    await page.click('[data-testid="next-step-button"]');
    
    // Should reach confirmation
    await expect(page.locator('[data-testid="registration-step-confirmation"]')).toBeVisible();
    
    // Go back to start for secretary test
    await page.goto('/');
    
    // Test 2: Secretary workflow
    await testSetup.signIn('secretary');
    await page.goto('/shows/show-123/register');
    
    // Quick secretary registration
    await page.click('[data-testid="dog-card-1"] [data-testid="select-dog-button"]');
    await page.click('[data-testid="next-step-button"]');
    await page.click('[data-testid="class-option-novice-standard"]');
    await page.click('[data-testid="next-step-button"]');
    await page.click('[data-testid="next-step-button"]'); // Skip handler
    await page.click('[data-testid="payment-method-secretary-paid"]');
    await page.click('[data-testid="next-step-button"]');
    
    // Should reach confirmation with secretary features
    await expect(page.locator('[data-testid="registration-step-confirmation"]')).toBeVisible();
    await expect(page.locator('[data-testid="secretary-management-tabs"]')).toBeVisible();
  });

  test('should validate all required data-testid attributes', async ({ page }) => {
    await testSetup.signIn('secretary');
    await page.goto('/shows/show-123/register');
    
    // Critical test IDs that should be present
    const requiredTestIds = [
      'registration-step-dog-selection',
      'dog-search-interface',
      'search-input',
      'dog-card-1',
      'select-dog-button',
      'next-step-button',
      'selected-dogs-count'
    ];
    
    for (const testId of requiredTestIds) {
      await expect(page.locator(`[data-testid="${testId}"]`)).toBeVisible();
    }
    
    // Move to class selection
    await page.click('[data-testid="dog-card-1"] [data-testid="select-dog-button"]');
    await page.click('[data-testid="next-step-button"]');
    
    const classSelectionTestIds = [
      'registration-step-class-selection',
      'class-option-novice-standard',
      'selected-classes-count'
    ];
    
    for (const testId of classSelectionTestIds) {
      await expect(page.locator(`[data-testid="${testId}"]`)).toBeVisible();
    }
  });

  test('should handle all workflow paths without errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    await testSetup.signIn('secretary');
    await page.goto('/shows/show-123/register');
    
    // Go through full workflow
    await page.click('[data-testid="dog-card-1"] [data-testid="select-dog-button"]');
    await page.click('[data-testid="next-step-button"]');
    await page.click('[data-testid="class-option-novice-standard"]');
    await page.click('[data-testid="next-step-button"]');
    await page.click('[data-testid="next-step-button"]');
    await page.click('[data-testid="payment-method-check"]');
    await page.fill('[data-testid="check-number-input"]', '2001');
    await page.click('[data-testid="next-step-button"]');
    await page.click('[data-testid="complete-registration-button"]');
    
    // Should complete without console errors
    expect(consoleErrors.filter(error => 
      !error.includes('DevTools') && 
      !error.includes('Warning:') &&
      !error.includes('Download')
    )).toHaveLength(0);
    
    await expect(page.locator('[data-testid="registration-success-message"]')).toBeVisible();
  });

  test('should maintain performance standards', async ({ page }) => {
    await testSetup.signIn('secretary');
    
    // Measure page load time
    const startTime = Date.now();
    await page.goto('/shows/show-123/register');
    await page.waitForSelector('[data-testid="registration-step-dog-selection"]');
    const loadTime = Date.now() - startTime;
    
    expect(loadTime).toBeLessThan(3000); // 3 second timeout for E2E
    
    // Test search performance
    const searchStart = Date.now();
    await page.fill('[data-testid="search-input"]', 'Golden');
    await page.waitForSelector('[data-testid="search-results"]', { timeout: 1000 });
    const searchTime = Date.now() - searchStart;
    
    expect(searchTime).toBeLessThan(1000); // 1 second for search
  });

  test('should be accessible with keyboard navigation', async ({ page }) => {
    await testSetup.signIn('user');
    await page.goto('/shows/show-123/register');
    
    // Test tab navigation
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    
    // Should be able to select dog with keyboard
    const focusedElement = await page.locator(':focus');
    await expect(focusedElement).toBeVisible();
    
    // Test Enter key for selection
    await page.keyboard.press('Enter');
    
    // Should be able to navigate to next step
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    
    // Should reach class selection
    await expect(page.locator('[data-testid="registration-step-class-selection"]')).toBeVisible();
  });

  test('should work across different viewport sizes', async ({ page }) => {
    await testSetup.signIn('user');
    
    // Test desktop
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/shows/show-123/register');
    await expect(page.locator('[data-testid="registration-step-dog-selection"]')).toBeVisible();
    
    // Test tablet
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.reload();
    await expect(page.locator('[data-testid="registration-step-dog-selection"]')).toBeVisible();
    
    // Test mobile
    await page.setViewportSize({ width: 375, height: 667 });
    await page.reload();
    await expect(page.locator('[data-testid="registration-step-dog-selection"]')).toBeVisible();
    
    // Should still be functional on mobile
    await page.click('[data-testid="dog-card-1"] [data-testid="select-dog-button"]');
    await page.click('[data-testid="next-step-button"]');
    await expect(page.locator('[data-testid="registration-step-class-selection"]')).toBeVisible();
  });
});