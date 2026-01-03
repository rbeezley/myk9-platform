import { test, expect } from '@playwright/test';

test.describe('Registration Smoke Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Mock minimal API responses
    await page.route('**/api/**', async (route) => {
      const url = route.request().url();
      
      if (url.includes('/dogs/search')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            { id: 'dog-1', callName: 'Buddy', breed: 'Golden Retriever' },
            { id: 'dog-2', callName: 'Max', breed: 'Labrador' }
          ])
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true })
        });
      }
    });
  });

  test('should load registration page without errors', async ({ page }) => {
    await page.goto('/shows/show-123/register');
    
    // Check for critical elements
    await expect(page.locator('h1, h2, [role="heading"]')).toBeVisible();
    
    // No major console errors
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && !msg.text().includes('DevTools')) {
        errors.push(msg.text());
      }
    });
    
    await page.waitForTimeout(2000);
    expect(errors.filter(e => !e.includes('Warning:'))).toHaveLength(0);
  });

  test('should have accessible navigation', async ({ page }) => {
    await page.goto('/shows/show-123/register');
    
    // Check for navigation elements
    const buttons = page.locator('button');
    const links = page.locator('a');
    
    expect(await buttons.count()).toBeGreaterThan(0);
    expect(await links.count()).toBeGreaterThan(0);
  });

  test('should respond to basic interactions', async ({ page }) => {
    await page.goto('/shows/show-123/register');
    
    // Try to interact with form elements
    const inputs = page.locator('input');
    const buttons = page.locator('button');
    
    if (await inputs.count() > 0) {
      await inputs.first().click();
    }
    
    if (await buttons.count() > 0) {
      const firstButton = buttons.first();
      if (await firstButton.isEnabled()) {
        await firstButton.click();
      }
    }
    
    // Should not crash
    await page.waitForTimeout(1000);
  });
});