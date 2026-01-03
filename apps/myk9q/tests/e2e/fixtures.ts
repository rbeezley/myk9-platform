import { test as base, expect, Page } from '@playwright/test';

/**
 * myK9Q E2E Test Fixtures
 *
 * Provides reusable authentication helpers and page objects
 * for E2E testing of the dog show scoring application.
 */

// Test credentials - use PROD_PASSCODE env var for production testing
// Default is the dev test passcode, set PROD_PASSCODE=AAC99 for production
export const TEST_PASSCODE = process.env.PROD_PASSCODE || 'AA260';

/**
 * Navigate from landing page to login page
 */
export async function navigateToLogin(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Click the hero section "Get Started" button (more specific than nav)
  // The hero button has class "btn-primary" and is inside #hero
  const heroGetStarted = page.locator('#hero button.btn-primary, .hero-section button.btn-primary, .hero button:has-text("Get Started")').first();

  // Fallback to navigation CTA if hero button not found
  const navGetStarted = page.locator('nav button.nav-cta, header button:has-text("Get Started")').first();

  // Try hero button first, then nav button
  if (await heroGetStarted.isVisible({ timeout: 3000 })) {
    await heroGetStarted.click();
  } else if (await navGetStarted.isVisible({ timeout: 2000 })) {
    await navGetStarted.click();
  } else {
    // Last resort - click first visible "Get Started" button
    await page.locator('button:has-text("Get Started"):visible').first().click();
  }

  await page.waitForURL('**/login');
}

/**
 * Enter passcode character by character into the 5 input boxes
 */
export async function enterPasscode(page: Page, passcode: string): Promise<void> {
  const inputs = page.locator('.passcode-input, input[maxlength="1"]');
  await expect(inputs).toHaveCount(5, { timeout: 10000 });

  // Enter each character
  for (let i = 0; i < passcode.length && i < 5; i++) {
    await inputs.nth(i).fill(passcode[i]);
    // Small delay to allow auto-advance
    await page.waitForTimeout(100);
  }
}

/**
 * Enter passcode by pasting (tests paste functionality)
 */
export async function pastePasscode(page: Page, passcode: string): Promise<void> {
  const firstInput = page.locator('.passcode-input, input[maxlength="1"]').first();
  await expect(firstInput).toBeVisible({ timeout: 10000 });

  // Focus the first input and paste
  await firstInput.focus();

  // Use clipboard API to paste
  await page.evaluate((code) => {
    navigator.clipboard.writeText(code);
  }, passcode);

  await firstInput.press('Control+v');
}

/**
 * Wait for offline preparation overlay to complete
 */
export async function waitForOfflinePrep(page: Page, timeoutMs = 45000): Promise<boolean> {
  try {
    // Wait for offline prep overlay to appear
    const overlay = page.locator('.offline-prep-overlay');
    const overlayVisible = await overlay.isVisible({ timeout: 5000 }).catch(() => false);

    if (overlayVisible) {
      // Wait for it to disappear (caching complete)
      await expect(overlay).toBeHidden({ timeout: timeoutMs });
    }

    return true;
  } catch {
    // If no overlay or timeout, check if we made it to home
    const currentUrl = page.url();
    return currentUrl.includes('/home');
  }
}

/**
 * Complete full login flow: Landing -> Login -> Enter passcode -> Wait for prep -> Home
 */
export async function performLogin(
  page: Page,
  passcode: string = TEST_PASSCODE
): Promise<boolean> {
  try {
    // Navigate to login page
    await navigateToLogin(page);

    // Enter passcode
    await enterPasscode(page, passcode);

    // Passcode auto-submits after 5th character
    // Wait for either offline prep overlay or direct navigation to home
    await page.waitForTimeout(500);

    // Wait for offline preparation to complete
    await waitForOfflinePrep(page);

    // Verify we're on the home page (increased timeout for CI)
    await page.waitForURL('**/home', { timeout: 45000 });

    return true;
  } catch (error) {
    console.error('Login failed:', error);
    return false;
  }
}

/**
 * Dismiss onboarding overlay if visible
 * The Skip button has class "onboarding-skip"
 */
export async function dismissOnboarding(page: Page): Promise<void> {
  // Small wait to allow overlay to render if it's going to appear
  await page.waitForTimeout(500);

  // Check if onboarding overlay is present
  const overlay = page.locator('.onboarding-overlay');
  const overlayVisible = await overlay.isVisible({ timeout: 2000 }).catch(() => false);

  if (overlayVisible) {
    // Use the exact class selector for the Skip button
    const skipButton = page.locator('button.onboarding-skip');

    if (await skipButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await skipButton.click();
      // Wait for overlay to disappear
      await overlay.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    } else {
      // Fallback: try clicking any button with "Skip" text
      const fallbackSkip = page.locator('button:has-text("Skip")').first();
      if (await fallbackSkip.isVisible({ timeout: 500 }).catch(() => false)) {
        await fallbackSkip.click();
        await overlay.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
      }
    }
  }
}

/**
 * Check if user is authenticated (on a protected page)
 */
export async function isAuthenticated(page: Page): Promise<boolean> {
  const url = page.url();
  return (
    url.includes('/home') ||
    url.includes('/trial') ||
    url.includes('/class') ||
    url.includes('/entries') ||
    url.includes('/settings')
  );
}

/**
 * Extended test fixture with pre-authenticated page
 */
export const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ page }, use) => {
    // Perform login before test
    const success = await performLogin(page);
    if (!success) {
      throw new Error('Failed to authenticate before test');
    }
    await use(page);
  },
});

export { expect };
