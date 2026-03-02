import { test, expect } from '@playwright/test';

const TEST_USER = {
  email: `test${Date.now()}@example.com`, // Unique email to avoid conflicts
  password: 'TestUser123!',
  firstName: 'Test',
  lastName: 'User'
};

test.describe('Complete User Journey - Real World Flow', () => {
  test('should sign up, authenticate, browse shows, and view show details', async ({ page }) => {
    // Monitor console messages for debugging
    const consoleLogs: string[] = [];
    const errors: string[] = [];
    
    page.on('console', msg => {
      const message = `${msg.type()}: ${msg.text()}`;
      consoleLogs.push(message);
      if (msg.type() === 'error') {
        errors.push(message);
      }
    });

    // Step 1: Navigate to a protected route (Browse Shows)
    console.log('🌐 Navigating to Browse Shows (protected route)...');
    await page.goto('http://127.0.0.1:5174/shows');
    
    // Step 2: Should redirect to sign-in (protected route)
    await expect(page).toHaveURL(/.*sign-in/);
    console.log('✅ Correctly redirected to sign-in page');

    // Step 3: Go to sign-up page (real user flow)
    console.log('📝 Navigating to sign-up...');
    // Try multiple approaches to find the sign-up link
    const signUpSelector = 'a[href*="sign-up"], button:has-text("Sign Up"), text="Sign Up"';
    await page.click(signUpSelector);
    await expect(page).toHaveURL(/.*sign-up/);

    // Step 4: Sign up with new user account
    console.log('👤 Creating new user account...');
    console.log('📧 Email:', TEST_USER.email);
    
    await page.fill('input[name="firstName"], input[placeholder*="first" i]', TEST_USER.firstName);
    await page.fill('input[name="lastName"], input[placeholder*="last" i]', TEST_USER.lastName);
    await page.fill('input[type="email"], input[name="email"]', TEST_USER.email);
    await page.fill('input[type="password"], input[name="password"]', TEST_USER.password);
    
    // Submit sign-up form
    await page.click('button[type="submit"], button:has-text("Sign Up")');
    
    // Wait for sign-up to complete (may redirect or show confirmation)
    await page.waitForLoadState('networkidle');
    
    // Step 5: Handle post-signup flow (may vary based on email confirmation setup)
    const currentUrl = page.url();
    console.log('📍 Post-signup URL:', currentUrl);
    
    if (currentUrl.includes('sign-in')) {
      // If redirected back to sign-in, sign in with the new account
      console.log('🔐 Signing in with new account...');
      await page.fill('input[type="email"]', TEST_USER.email);
      await page.fill('input[type="password"]', TEST_USER.password);
      await page.click('button[type="submit"]');
      await page.waitForLoadState('networkidle');
    }
    
    // Step 6: Should now be authenticated - navigate to Browse Shows
    console.log('📋 Navigating to Browse Shows...');
    await page.goto('http://127.0.0.1:5174/shows');
    
    // Should not redirect to sign-in if properly authenticated
    await page.waitForLoadState('networkidle');
    const finalUrl = page.url();
    console.log('📍 Browse Shows URL:', finalUrl);
    
    if (finalUrl.includes('sign-in')) {
      console.error('❌ Still redirecting to sign-in - authentication failed');
      await page.screenshot({ path: 'auth-failure.png' });
      throw new Error('Authentication failed - still redirecting to sign-in');
    }

    // Step 7: Wait for shows data to load
    console.log('⏳ Waiting for shows to load...');
    await page.waitForTimeout(3000); // Give time for data to load
    
    // Step 8: Check for shows content
    const showElements = await page.locator('[data-testid="show-card"], .show-card, .card, [class*="show"], [class*="card"]').count();
    console.log(`📊 Found ${showElements} show-related elements`);
    
    // Look for any text content related to shows
    const pageText = await page.textContent('body');
    const hasShowContent = pageText && (
      pageText.includes('show') || 
      pageText.includes('Show') || 
      pageText.includes('trial') ||
      pageText.includes('Trial') ||
      pageText.includes('entry') ||
      pageText.includes('Entry')
    );
    
    console.log('📄 Page contains show-related content:', !!hasShowContent);
    
    if (!hasShowContent) {
      console.log('⚠️ No show content found - checking for error messages...');
      const errorElements = await page.locator('text=/error/i, text=/no.*found/i, text=/loading/i').all();
      for (const element of errorElements) {
        const text = await element.textContent();
        console.log('🚨 Error/status message:', text);
      }
      
      // Take screenshot for debugging
      await page.screenshot({ path: 'browse-shows-no-content.png', fullPage: true });
    }

    // Step 9: Look for View Details buttons or links
    const detailsButtons = await page.locator('text=/view.*details/i, text=/details/i, a[href*="show"], button:has-text("Details")').all();
    console.log(`🔍 Found ${detailsButtons.length} "View Details" elements`);
    
    if (detailsButtons.length > 0) {
      // Step 10: Click on first "View Details"
      console.log('👆 Clicking View Details...');
      await detailsButtons[0].click();
      
      // Wait for navigation to show details page
      await page.waitForLoadState('networkidle');
      
      const detailsUrl = page.url();
      console.log('📍 Show Details URL:', detailsUrl);
      
      // Step 11: Check Show Details page content
      const detailsPageText = await page.textContent('body');
      const hasDetailsContent = detailsPageText && !detailsPageText.toLowerCase().includes('no shows available');
      
      console.log('📄 Show Details page has content:', !!hasDetailsContent);
      
      if (!hasDetailsContent) {
        console.log('❌ Show Details page shows "no shows available"');
        const noShowsMessage = await page.locator('text=/no.*show/i, text=/not.*found/i, text=/no.*available/i').first().textContent();
        console.log('🚨 Error message:', noShowsMessage);
        
        // Take screenshot of the issue
        await page.screenshot({ path: 'show-details-no-content.png', fullPage: true });
        
        // This is the issue the user reported!
        console.log('🎯 FOUND THE ISSUE: Show Details page shows "no shows available"');
      } else {
        console.log('✅ Show Details page working correctly');
        await page.screenshot({ path: 'show-details-success.png' });
      }
      
      // Step 12: Verify show details content
      await expect(page.locator('body')).not.toContainText('no shows available');
      
    } else {
      console.log('⚠️ No "View Details" buttons found - may indicate Browse Shows issue');
      await page.screenshot({ path: 'no-view-details-buttons.png', fullPage: true });
    }

    // Log any console errors for debugging
    if (errors.length > 0) {
      console.log('🚨 Console Errors:');
      errors.forEach(error => console.log('  -', error));
    }
    
    // Log recent console messages
    console.log('📝 Recent Console Messages:');
    consoleLogs.slice(-10).forEach(log => console.log('  -', log));
  });

  test('should handle navigation between Browse Shows and Show Details', async ({ page }) => {
    console.log('🧪 Testing navigation flow specifically...');
    
    // Start at browse shows (assuming user is already authenticated from previous test)
    await page.goto('http://127.0.0.1:5174/shows');
    
    // If redirected to sign-in, authenticate first
    if (page.url().includes('sign-in')) {
      await page.fill('input[type="email"]', TEST_USER.email);
      await page.fill('input[type="password"]', TEST_USER.password);
      await page.click('button[type="submit"]');
      await page.waitForLoadState('networkidle');
      await page.goto('http://127.0.0.1:5174/shows');
    }
    
    await page.waitForLoadState('networkidle');
    
    // Take screenshot of Browse Shows page
    await page.screenshot({ path: 'browse-shows-page.png', fullPage: true });
    
    // Find any clickable show elements
    const showLinks = await page.locator('a[href*="show"], [data-testid*="show"] a, .card a').all();
    console.log(`🔗 Found ${showLinks.length} show links`);
    
    if (showLinks.length > 0) {
      const firstLink = showLinks[0];
      const href = await firstLink.getAttribute('href');
      console.log('🎯 Clicking link:', href);
      
      await firstLink.click();
      await page.waitForLoadState('networkidle');
      
      // Take screenshot of result
      await page.screenshot({ path: 'after-click-show-link.png', fullPage: true });
      
      const resultUrl = page.url();
      console.log('📍 Result URL:', resultUrl);
      
      // Check if we're on a show details page
      const isShowDetailsPage = resultUrl.includes('show') && !resultUrl.includes('browse-shows');
      console.log('📄 Is Show Details page:', isShowDetailsPage);
      
      if (isShowDetailsPage) {
        // Check page content
        const bodyText = await page.textContent('body');
        console.log('📄 Page contains "no shows available":', bodyText?.includes('no shows available'));
      }
    }
  });
});