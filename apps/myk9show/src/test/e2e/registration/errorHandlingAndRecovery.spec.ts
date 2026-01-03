import { test, expect } from '@playwright/test';
import { TestSetup } from '../helpers/testSetup';

test.describe('Registration Error Handling & Recovery', () => {
  let testSetup: TestSetup;

  test.beforeEach(async ({ page }) => {
    testSetup = new TestSetup(page);
    await testSetup.clearTestData();
  });

  test('should handle network failures with error boundaries', async ({ page }) => {
    // Mock intermittent network failures
    let failureCount = 0;
    await page.route('**/api/**', async (route) => {
      failureCount++;
      if (failureCount <= 2) {
        await route.abort('failed');
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true })
        });
      }
    });

    await testSetup.signIn('user');
    await page.goto('/shows/show-123/register');

    // Should show network error boundary
    await expect(page.locator('[data-testid="network-error-boundary"]')).toBeVisible();
    await expect(page.locator('[data-testid="error-title"]')).toContainText('Network Error');
    
    // Should show retry button
    await expect(page.locator('[data-testid="retry-button"]')).toBeVisible();
    
    // First retry should fail
    await page.click('[data-testid="retry-button"]');
    await expect(page.locator('[data-testid="retry-attempt-1"]')).toBeVisible();
    
    // Second retry should succeed
    await page.click('[data-testid="retry-button"]');
    await expect(page.locator('[data-testid="registration-step-dog-selection"]')).toBeVisible();
  });

  test('should handle search component failures gracefully', async ({ page }) => {
    await testSetup.signIn('secretary');
    
    // Mock search API failure
    await page.route('**/api/dogs/search**', async (route) => {
      await route.abort('failed');
    });
    
    await page.goto('/shows/show-123/register');
    
    // Search component should show error boundary
    await page.fill('[data-testid="search-input"]', 'test search');
    await expect(page.locator('[data-testid="search-error-boundary"]')).toBeVisible();
    
    // Should offer fallback options
    await expect(page.locator('[data-testid="browse-all-dogs-fallback"]')).toBeVisible();
    await expect(page.locator('[data-testid="create-new-fallback"]')).toBeVisible();
    
    // Fallback should work
    await page.click('[data-testid="browse-all-dogs-fallback"]');
    await expect(page.locator('[data-testid="dog-list-fallback"]')).toBeVisible();
  });

  test('should handle payment processing errors', async ({ page }) => {
    await testSetup.signIn('user');
    await page.goto('/shows/show-123/register');
    
    // Complete to payment step
    await page.click('[data-testid="dog-card-1"] [data-testid="select-dog-button"]');
    await page.click('[data-testid="next-step-button"]');
    await page.click('[data-testid="class-option-novice-standard"]');
    await page.click('[data-testid="next-step-button"]');
    
    // Mock payment failure
    await page.route('**/api/payments/**', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ 
          error: 'payment_failed',
          message: 'Credit card was declined'
        })
      });
    });
    
    // Attempt payment
    await page.click('[data-testid="payment-method-credit-card"]');
    await page.fill('[data-testid="card-number"]', '4000000000000002'); // Declined test card
    await page.click('[data-testid="process-payment-button"]');
    
    // Should show payment error boundary
    await expect(page.locator('[data-testid="payment-error-boundary"]')).toBeVisible();
    await expect(page.locator('[data-testid="payment-error-message"]')).toContainText('Credit card was declined');
    
    // Should offer alternative payment methods
    await expect(page.locator('[data-testid="try-different-card"]')).toBeVisible();
    await expect(page.locator('[data-testid="switch-to-check"]')).toBeVisible();
    
    // Switch to check payment
    await page.click('[data-testid="switch-to-check"]');
    await expect(page.locator('[data-testid="payment-method-check"]')).toBeChecked();
  });

  test('should recover from component crashes with retry', async ({ page }) => {
    await testSetup.signIn('secretary');
    
    // Inject script that will crash the component
    await page.addInitScript(() => {
      let crashCount = 0;
      const originalRender = window.React?.Component?.prototype?.render;
      if (originalRender) {
        window.React.Component.prototype.render = function() {
          if (this.constructor.name === 'ClassSelectionStep' && crashCount < 2) {
            crashCount++;
            throw new Error('Simulated component crash');
          }
          return originalRender.call(this);
        };
      }
    });
    
    await page.goto('/shows/show-123/register');
    
    // Complete dog selection
    await page.click('[data-testid="dog-card-1"] [data-testid="select-dog-button"]');
    await page.click('[data-testid="next-step-button"]');
    
    // Should show component error boundary
    await expect(page.locator('[data-testid="component-error-boundary"]')).toBeVisible();
    await expect(page.locator('[data-testid="error-component-name"]')).toContainText('ClassSelectionStep');
    
    // Should show retry options
    await expect(page.locator('[data-testid="retry-component"]')).toBeVisible();
    await expect(page.locator('[data-testid="go-back-step"]')).toBeVisible();
    
    // Retry should work after a few attempts
    await page.click('[data-testid="retry-component"]');
    await page.click('[data-testid="retry-component"]');
    
    // Component should render successfully
    await expect(page.locator('[data-testid="registration-step-class-selection"]')).toBeVisible();
  });

  test('should handle offline scenarios', async ({ page }) => {
    await testSetup.signIn('user');
    
    // Simulate offline
    await page.context().setOffline(true);
    
    await page.goto('/shows/show-123/register');
    
    // Should show offline indicator
    await expect(page.locator('[data-testid="offline-indicator"]')).toBeVisible();
    await expect(page.locator('[data-testid="offline-message"]')).toContainText('You are currently offline');
    
    // Should cache registration progress
    await page.fill('[data-testid="search-input"]', 'golden retriever');
    
    // Should show cached results if available
    await expect(page.locator('[data-testid="cached-results-offline"]')).toBeVisible();
    
    // Go back online
    await page.context().setOffline(false);
    
    // Should show reconnection indicator
    await expect(page.locator('[data-testid="reconnected-indicator"]')).toBeVisible();
    
    // Should sync pending changes
    await expect(page.locator('[data-testid="sync-complete"]')).toBeVisible();
  });

  test('should handle server errors with exponential backoff', async ({ page }) => {
    let attemptCount = 0;
    const attemptTimes: number[] = [];
    
    await page.route('**/api/registrations', async (route) => {
      attemptCount++;
      attemptTimes.push(Date.now());
      
      if (attemptCount < 4) {
        await route.fulfill({ status: 500 });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, id: 'reg-123' })
        });
      }
    });
    
    await testSetup.signIn('user');
    await page.goto('/shows/show-123/register');
    
    // Complete registration workflow
    await page.click('[data-testid="dog-card-1"] [data-testid="select-dog-button"]');
    await page.click('[data-testid="next-step-button"]');
    await page.click('[data-testid="class-option-novice-standard"]');
    await page.click('[data-testid="next-step-button"]');
    await page.click('[data-testid="payment-method-check"]');
    await page.fill('[data-testid="check-number-input"]', '1234');
    await page.click('[data-testid="next-step-button"]');
    
    // Submit registration
    await page.click('[data-testid="complete-registration-button"]');
    
    // Should show retry attempts with backoff
    await expect(page.locator('[data-testid="retry-attempt-1"]')).toBeVisible();
    await expect(page.locator('[data-testid="retry-attempt-2"]')).toBeVisible();
    await expect(page.locator('[data-testid="retry-attempt-3"]')).toBeVisible();
    
    // Should eventually succeed
    await expect(page.locator('[data-testid="registration-success-message"]')).toBeVisible();
    
    // Verify exponential backoff timing
    expect(attemptTimes).toHaveLength(4);
    
    // Second attempt should be ~1s after first
    expect(attemptTimes[1] - attemptTimes[0]).toBeGreaterThan(800);
    expect(attemptTimes[1] - attemptTimes[0]).toBeLessThan(1500);
    
    // Third attempt should be ~2s after second
    expect(attemptTimes[2] - attemptTimes[1]).toBeGreaterThan(1800);
    expect(attemptTimes[2] - attemptTimes[1]).toBeLessThan(2500);
  });

  test('should preserve registration data during errors', async ({ page }) => {
    await testSetup.signIn('user');
    await page.goto('/shows/show-123/register');
    
    // Fill registration data
    await page.click('[data-testid="dog-card-1"] [data-testid="select-dog-button"]');
    await page.click('[data-testid="next-step-button"]');
    await page.click('[data-testid="class-option-novice-standard"]');
    await page.click('[data-testid="class-option-novice-jumpers"]');
    
    // Mock error that requires page reload
    await page.evaluate(() => {
      throw new Error('Simulated page error');
    });
    
    // Reload page
    await page.reload();
    
    // Should restore registration state
    await expect(page.locator('[data-testid="draft-restored"]')).toBeVisible();
    
    // Navigate to class selection
    await page.click('[data-testid="next-step-button"]');
    
    // Should have preserved selections
    await expect(page.locator('[data-testid="class-option-novice-standard"]')).toBeChecked();
    await expect(page.locator('[data-testid="class-option-novice-jumpers"]')).toBeChecked();
  });

  test('should handle concurrent registration conflicts', async ({ page, context }) => {
    // Create second browser context for concurrent session
    const page2 = await context.newPage();
    
    await testSetup.signIn('secretary');
    
    // Both sessions start same registration
    await page.goto('/shows/show-123/register');
    await page2.goto('/shows/show-123/register');
    
    // Both select same dog
    await page.click('[data-testid="dog-card-1"] [data-testid="select-dog-button"]');
    await page2.click('[data-testid="dog-card-1"] [data-testid="select-dog-button"]');
    
    // Both proceed to class selection
    await page.click('[data-testid="next-step-button"]');
    await page2.click('[data-testid="next-step-button"]');
    
    // Both select same class
    await page.click('[data-testid="class-option-novice-standard"]');
    await page2.click('[data-testid="class-option-novice-standard"]');
    
    // First session completes registration
    await page.click('[data-testid="next-step-button"]');
    await page.click('[data-testid="next-step-button"]');
    await page.click('[data-testid="payment-method-check"]');
    await page.fill('[data-testid="check-number-input"]', '1001');
    await page.click('[data-testid="next-step-button"]');
    await page.click('[data-testid="complete-registration-button"]');
    
    // Second session tries to complete
    await page2.click('[data-testid="next-step-button"]');
    await page2.click('[data-testid="next-step-button"]');
    await page2.click('[data-testid="payment-method-check"]');
    await page2.fill('[data-testid="check-number-input"]', '1002');
    await page2.click('[data-testid="next-step-button"]');
    await page2.click('[data-testid="complete-registration-button"]');
    
    // Should show conflict resolution UI
    await expect(page2.locator('[data-testid="conflict-resolution-dialog"]')).toBeVisible();
    await expect(page2.locator('[data-testid="conflict-message"]')).toContainText('This dog is already registered');
    
    // Should offer resolution options
    await expect(page2.locator('[data-testid="view-existing-registration"]')).toBeVisible();
    await expect(page2.locator('[data-testid="register-different-class"]')).toBeVisible();
    await expect(page2.locator('[data-testid="contact-show-secretary"]')).toBeVisible();
    
    await page2.close();
  });

  test('should log errors for debugging', async ({ page }) => {
    await testSetup.signIn('user');
    
    // Mock console to capture error logs
    const errorLogs: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errorLogs.push(msg.text());
      }
    });
    
    // Trigger various error scenarios
    await page.goto('/shows/show-123/register');
    
    // Network error
    await page.route('**/api/dogs', async (route) => {
      await route.abort('failed');
    });
    
    await page.click('[data-testid="search-input"]');
    await page.fill('[data-testid="search-input"]', 'test');
    
    // Wait for error to be logged
    await page.waitForTimeout(1000);
    
    // Check error logging
    expect(errorLogs.some(log => log.includes('Network request failed'))).toBeTruthy();
    
    // Check localStorage error storage
    const storedErrors = await page.evaluate(() => {
      const errors = localStorage.getItem('registration_errors');
      return errors ? JSON.parse(errors) : [];
    });
    
    expect(storedErrors).toHaveLength(1);
    expect(storedErrors[0]).toMatchObject({
      type: 'network_error',
      context: 'dog_search',
      timestamp: expect.any(String)
    });
  });
});