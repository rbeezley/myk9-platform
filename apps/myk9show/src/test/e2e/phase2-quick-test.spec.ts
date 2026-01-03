import { test } from '@playwright/test';
import { ShowTestHelper } from './helpers/showTestHelper';

test.describe('Phase 2: Quick Show Management Test', () => {
  let showHelper: ShowTestHelper;

  test.beforeEach(async ({ page }) => {
    showHelper = new ShowTestHelper(page);
    // Clear any existing state
    await showHelper.clearTestData();
  });

  test('should load sign-in page and authenticate', async ({ page }) => {
    console.log('Starting authentication test...');
    
    // Navigate directly to sign-in page
    console.log('Navigating to sign-in page...');
    await page.goto('/sign-in', { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });
    
    // Wait for the page to load
    console.log('Waiting for sign-in form...');
    await page.waitForSelector('[data-testid="email-input"]', { 
      state: 'visible',
      timeout: 15000 
    });
    
    // Fill in credentials
    console.log('Filling credentials...');
    await page.fill('[data-testid="email-input"]', 'working-secretary@example.com');
    await page.fill('[data-testid="password-input"]', 'testpass123');
    
    // Submit form
    console.log('Clicking sign in...');
    await page.click('[data-testid="sign-in-button"]');
    
    // Wait for navigation
    console.log('Waiting for navigation...');
    await page.waitForURL('/', { timeout: 15000 });
    
    console.log('Authentication successful!');
    
    // Take a screenshot for verification
    await page.screenshot({ path: 'test-results/auth-success.png' });
  });

  test('should navigate to show creation', async ({ page }) => {
    console.log('Testing show creation navigation...');
    
    // Sign in first
    await showHelper.signIn('secretary');
    
    // Navigate to shows
    console.log('Navigating to shows page...');
    await page.goto('/shows', { waitUntil: 'domcontentloaded' });
    
    // Look for create show button
    console.log('Looking for create show button...');
    const createButton = page.locator('button:has-text("Create Show"), button:has-text("New Show"), a:has-text("Create Show")').first();
    
    if (await createButton.isVisible()) {
      console.log('Create show button found!');
      await page.screenshot({ path: 'test-results/shows-page.png' });
    } else {
      console.log('Create show button not found, taking screenshot...');
      await page.screenshot({ path: 'test-results/shows-page-no-button.png' });
      
      // List all visible buttons for debugging
      const buttons = await page.locator('button').all();
      for (let i = 0; i < buttons.length; i++) {
        const text = await buttons[i].textContent();
        console.log(`Button ${i}: ${text}`);
      }
    }
  });
});