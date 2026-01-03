import { test, expect } from '@playwright/test';

test.describe('Basic Cross-Browser Functionality Tests', () => {
  test.describe('Page Loading and Navigation', () => {
    test('homepage loads successfully across browsers', async ({ page, browserName }) => {
      await page.goto('/');
      
      // Check that the page loads and has basic content
      const headingCount = await page.locator('h1, h2, h3').count();
      expect(headingCount).toBeGreaterThan(0);
      await expect(page.locator('nav')).toBeVisible();
      
      console.log(`✅ ${browserName}: Homepage loaded successfully`);
    });

    test('sign-in page loads and displays form', async ({ page, browserName }) => {
      await page.goto('/sign-in');
      
      // Verify sign-in page structure
      await expect(page.locator('h2:has-text("Sign in")')).toBeVisible();
      await expect(page.locator('input[type="email"], input[placeholder*="email" i]')).toBeVisible();
      await expect(page.locator('input[type="password"]')).toBeVisible();
      await expect(page.locator('button:has-text("Sign")')).toBeVisible();
      
      console.log(`✅ ${browserName}: Sign-in page displays correctly`);
    });

    test('navigation between pages works', async ({ page, browserName }) => {
      // Start at homepage
      await page.goto('/');
      await expect(page).toHaveURL('/');
      
      // Navigate to sign-in
      await page.click('a:has-text("Sign In")');
      await expect(page).toHaveURL('/sign-in');
      
      // Navigate back to homepage
      await page.click('a:has-text("myK9Show")');
      await expect(page).toHaveURL('/');
      
      console.log(`✅ ${browserName}: Navigation works correctly`);
    });
  });

  test.describe('Form Interactions', () => {
    test('form fields accept input', async ({ page, browserName }) => {
      await page.goto('/sign-in');
      
      // Test text input
      const emailField = page.locator('input[type="email"], input[placeholder*="email" i]');
      await emailField.fill('test@example.com');
      await expect(emailField).toHaveValue('test@example.com');
      
      // Test password input
      const passwordField = page.locator('input[type="password"]');
      await passwordField.fill('testpassword');
      await expect(passwordField).toHaveValue('testpassword');
      
      console.log(`✅ ${browserName}: Form inputs work correctly`);
    });

    test('buttons are clickable', async ({ page, browserName }) => {
      await page.goto('/sign-in');
      
      // Verify button is clickable
      const signInButton = page.locator('button:has-text("Sign")');
      await expect(signInButton).toBeVisible();
      await expect(signInButton).toBeEnabled();
      
      // Fill required fields first to enable button
      await page.fill('input[type="email"], input[placeholder*="email" i]', 'test@example.com');
      await page.fill('input[type="password"]', 'password');
      
      // Click button (should trigger some action)
      await signInButton.click();
      
      console.log(`✅ ${browserName}: Buttons are clickable`);
    });
  });

  test.describe('CSS and Styling', () => {
    test('basic styling is applied', async ({ page, browserName }) => {
      await page.goto('/');
      
      // Check that CSS is loaded by verifying computed styles
      const body = page.locator('body');
      const bodyStyles = await body.evaluate((el) => {
        const computed = window.getComputedStyle(el);
        return {
          fontFamily: computed.fontFamily,
          backgroundColor: computed.backgroundColor,
          margin: computed.margin
        };
      });
      
      // Verify styles are applied (not browser defaults)
      expect(bodyStyles.fontFamily).toBeTruthy();
      expect(bodyStyles.fontFamily).not.toBe('Times');
      
      console.log(`✅ ${browserName}: CSS styling applied - Font: ${bodyStyles.fontFamily}`);
    });

    test('responsive design elements', async ({ page, browserName }) => {
      // Test desktop view
      await page.setViewportSize({ width: 1200, height: 800 });
      await page.goto('/');
      
      const nav = page.locator('nav');
      await expect(nav).toBeVisible();
      
      // Test mobile view
      await page.setViewportSize({ width: 375, height: 667 });
      await page.reload();
      
      // Navigation should still be accessible (may be different layout)
      await expect(nav).toBeVisible();
      
      console.log(`✅ ${browserName}: Responsive design works`);
    });
  });

  test.describe('JavaScript Functionality', () => {
    test('client-side JavaScript executes', async ({ page, browserName }) => {
      await page.goto('/');
      
      // Test that React has loaded by checking for React-rendered content
      const reactContent = await page.evaluate(() => {
        // Check if React DevTools hint is in console (indicates React is running)
        return {
          hasReactElements: document.querySelectorAll('[data-reactroot], #root *').length > 0,
          title: document.title,
          bodyChildren: document.body.children.length
        };
      });
      
      expect(reactContent.hasReactElements).toBe(true);
      expect(reactContent.bodyChildren).toBeGreaterThan(0);
      expect(reactContent.title).toContain('myK9Show');
      
      console.log(`✅ ${browserName}: JavaScript executes correctly`);
    });

    test('event handlers work', async ({ page, browserName }) => {
      await page.goto('/sign-in');
      
      // Test focus events
      const emailField = page.locator('input[type="email"], input[placeholder*="email" i]');
      await emailField.focus();
      
      // Verify focus state (should have some visual indication)
      const isFocused = await emailField.evaluate((el) => el === document.activeElement);
      expect(isFocused).toBe(true);
      
      console.log(`✅ ${browserName}: Event handlers work correctly`);
    });
  });

  test.describe('Browser-Specific Features', () => {
    test('local storage works', async ({ page, browserName }) => {
      await page.goto('/');
      
      // Test localStorage functionality
      const storageTest = await page.evaluate(() => {
        try {
          localStorage.setItem('test-key', 'test-value');
          const value = localStorage.getItem('test-key');
          localStorage.removeItem('test-key');
          return value === 'test-value';
        } catch {
          return false;
        }
      });
      
      expect(storageTest).toBe(true);
      
      console.log(`✅ ${browserName}: LocalStorage works`);
    });

    test('modern JavaScript features work', async ({ page, browserName }) => {
      await page.goto('/');
      
      // Test modern JS features
      const jsFeatures = await page.evaluate(() => {
        try {
          // Test arrow functions, destructuring, async/await
          const test = async () => {
            const [a, b] = [1, 2];
            return Promise.resolve(a + b);
          };
          
          return {
            arrowFunctions: typeof test === 'function',
            promises: typeof Promise !== 'undefined',
            asyncAwait: test.constructor.name === 'AsyncFunction',
            destructuring: true // If we get here, destructuring worked
          };
        } catch (e) {
          return { error: e.message };
        }
      });
      
      expect(jsFeatures.arrowFunctions).toBe(true);
      expect(jsFeatures.promises).toBe(true);
      
      console.log(`✅ ${browserName}: Modern JavaScript features work`);
    });
  });

  test.describe('Performance Basics', () => {
    test('page loads within reasonable time', async ({ page, browserName }) => {
      const startTime = Date.now();
      
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      
      const loadTime = Date.now() - startTime;
      
      // Different browsers have different performance characteristics
      const maxLoadTime = browserName === 'webkit' ? 8000 : 
                         browserName === 'firefox' ? 6000 : 5000;
      
      expect(loadTime).toBeLessThan(maxLoadTime);
      
      console.log(`✅ ${browserName}: Page loaded in ${loadTime}ms`);
    });

    test('no major console errors', async ({ page, browserName }) => {
      const errors: string[] = [];
      
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          errors.push(msg.text());
        }
      });
      
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      
      // Filter out expected/non-critical errors
      const criticalErrors = errors.filter(error => 
        !error.includes('WebSocket') && 
        !error.includes('404') &&
        !error.includes('Failed to load resource') &&
        !error.toLowerCase().includes('font')
      );
      
      console.log(`${browserName}: Found ${errors.length} total errors, ${criticalErrors.length} critical`);
      
      // We allow some non-critical errors but should have minimal critical ones
      expect(criticalErrors.length).toBeLessThan(3);
      
      console.log(`✅ ${browserName}: No major console errors`);
    });
  });
});