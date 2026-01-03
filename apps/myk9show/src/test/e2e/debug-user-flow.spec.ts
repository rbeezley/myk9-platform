import { test, expect } from '@playwright/test';

test.describe('Debug User Flow', () => {
  test('should examine sign-in page and try to create account', async ({ page }) => {
    // Navigate to protected route to trigger redirect
    await page.goto('http://127.0.0.1:5174/browse-shows');
    
    // Should be on sign-in page
    await expect(page).toHaveURL(/.*sign-in/);
    console.log('✅ Successfully redirected to sign-in page');
    
    // Take screenshot to see what's available
    await page.screenshot({ path: 'sign-in-page.png', fullPage: true });
    
    // Log all links and buttons on the page
    const links = await page.locator('a').all();
    console.log('🔗 Available links:');
    for (const link of links) {
      const href = await link.getAttribute('href');
      const text = await link.textContent();
      console.log(`  - "${text}" -> ${href}`);
    }
    
    const buttons = await page.locator('button').all();
    console.log('🔘 Available buttons:');
    for (const button of buttons) {
      const text = await button.textContent();
      const type = await button.getAttribute('type');
      console.log(`  - "${text}" (type: ${type})`);
    }
    
    // Look for sign-up related elements
    const signUpElements = await page.locator('*:has-text("sign up"), *:has-text("Sign Up"), *:has-text("register"), *:has-text("Register"), a[href*="sign-up"]').all();
    console.log(`📝 Found ${signUpElements.length} sign-up related elements`);
    
    for (const element of signUpElements) {
      const text = await element.textContent();
      const tagName = await element.evaluate(el => el.tagName);
      const href = await element.getAttribute('href');
      console.log(`  - ${tagName}: "${text}" ${href ? '-> ' + href : ''}`);
    }
    
    // If no sign-up link, try creating account directly via URL
    if (signUpElements.length === 0) {
      console.log('⚠️ No sign-up link found, trying direct URL navigation...');
      await page.goto('http://127.0.0.1:5174/sign-up');
      
      if (page.url().includes('sign-up')) {
        console.log('✅ Sign-up page accessible via direct URL');
        await page.screenshot({ path: 'sign-up-page.png', fullPage: true });
        
        // Try to create an account
        const testEmail = `test${Date.now()}@example.com`;
        console.log('📧 Creating account with email:', testEmail);
        
        // Fill in the form (adapt selectors based on actual form)
        try {
          await page.fill('input[name="firstName"], input[placeholder*="first"]', 'Test');
          await page.fill('input[name="lastName"], input[placeholder*="last"]', 'User');
          await page.fill('input[type="email"], input[name="email"]', testEmail);
          await page.fill('input[type="password"], input[name="password"]', 'TestUser123!');
          
          // Submit form
          await page.click('button[type="submit"], button:has-text("Sign Up"), button:has-text("Create")');
          
          // Wait for result
          await page.waitForLoadState('networkidle');
          console.log('📍 After sign-up URL:', page.url());
          
          // Take screenshot of result
          await page.screenshot({ path: 'after-signup.png', fullPage: true });
          
        } catch (error) {
          console.log('❌ Error during sign-up:', error.message);
          await page.screenshot({ path: 'signup-error.png', fullPage: true });
        }
      } else {
        console.log('❌ Sign-up page not accessible');
      }
    } else {
      // Try clicking the first sign-up element
      console.log('👆 Clicking first sign-up element...');
      await signUpElements[0].click();
      await page.waitForLoadState('networkidle');
      console.log('📍 After click URL:', page.url());
      await page.screenshot({ path: 'after-signup-click.png', fullPage: true });
    }
  });

  test('should test browse shows with existing session if any', async ({ page }) => {
    // Try to go directly to browse shows
    await page.goto('http://127.0.0.1:5174/browse-shows');
    await page.waitForLoadState('networkidle');
    
    const currentUrl = page.url();
    console.log('📍 Browse Shows URL:', currentUrl);
    
    if (currentUrl.includes('browse-shows')) {
      console.log('✅ Accessed Browse Shows without sign-in - checking content...');
      
      // Take screenshot
      await page.screenshot({ path: 'browse-shows-accessible.png', fullPage: true });
      
      // Check for shows content
      const bodyText = await page.textContent('body');
      console.log('📄 Page contains "show":', bodyText?.includes('show'));
      console.log('📄 Page contains "Show":', bodyText?.includes('Show'));
      
      // Look for view details buttons
      const detailsButtons = await page.locator('*:has-text("details"), *:has-text("Details"), *:has-text("view"), *:has-text("View")').all();
      console.log(`🔍 Found ${detailsButtons.length} potential details buttons`);
      
      if (detailsButtons.length > 0) {
        console.log('👆 Clicking first details button...');
        await detailsButtons[0].click();
        await page.waitForLoadState('networkidle');
        
        const detailsUrl = page.url();
        console.log('📍 Details page URL:', detailsUrl);
        await page.screenshot({ path: 'show-details-page.png', fullPage: true });
        
        // Check for "no shows available" issue
        const detailsText = await page.textContent('body');
        const hasNoShowsError = detailsText?.toLowerCase().includes('no shows available');
        console.log('🚨 Shows "no shows available":', hasNoShowsError);
        
        if (hasNoShowsError) {
          console.log('🎯 FOUND THE ISSUE: Show Details page shows "no shows available"');
        }
      }
      
    } else {
      console.log('⚠️ Redirected to sign-in, need authentication');
    }
  });
});