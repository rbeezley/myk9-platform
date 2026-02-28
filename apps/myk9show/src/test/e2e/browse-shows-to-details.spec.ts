import { test, expect } from '@playwright/test';

test.describe('Browse Shows to Show Details Flow', () => {
  const testUser = {
    email: `test${Date.now()}@example.com`,
    password: 'TestUser123!',
    firstName: 'Test',
    lastName: 'User'
  };

  test('should create user, browse shows, and navigate to show details', async ({ page }) => {
    const consoleLogs: string[] = [];
    const consoleErrors: string[] = [];
    
    // Capture console messages
    page.on('console', msg => {
      const message = `${msg.type()}: ${msg.text()}`;
      consoleLogs.push(message);
      if (msg.type() === 'error') {
        consoleErrors.push(message);
      }
    });

    console.log('🎭 Starting complete Browse Shows → Show Details test');
    console.log('📧 Test user email:', testUser.email);

    // Step 1: Navigate to sign-up page directly
    console.log('📝 Step 1: Going to sign-up page...');
    await page.goto('http://127.0.0.1:5174/sign-up');
    await page.waitForLoadState('networkidle');
    
    if (!page.url().includes('sign-up')) {
      console.log('⚠️ Not on sign-up page, trying via sign-in redirect...');
      await page.goto('http://127.0.0.1:5174/shows');
      await page.click('a[href*="sign-up"], text="Sign Up"');
      await page.waitForLoadState('networkidle');
    }

    await page.screenshot({ path: 'signup-page.png' });

    // Step 2: Create account through normal UI
    console.log('👤 Step 2: Creating account through UI...');
    
    try {
      // Fill form fields - sign-up form only has email and password
      await page.fill('input[type="email"]', testUser.email);
      await page.fill('input[type="password"]', testUser.password);
      
      console.log('✅ Form filled successfully');
      
      // Submit the form
      await page.click('button[type="submit"], button:has-text("Sign Up"), button:has-text("Create Account")');
      await page.waitForLoadState('networkidle');
      
      console.log('📍 After signup URL:', page.url());
      await page.screenshot({ path: 'after-signup.png' });
      
    } catch (error) {
      console.log('❌ Signup form error:', error.message);
      await page.screenshot({ path: 'signup-form-error.png' });
      
      // Try alternative approach - maybe form structure is different
      const inputs = await page.locator('input').all();
      console.log(`Found ${inputs.length} input fields`);
      for (let i = 0; i < inputs.length; i++) {
        const type = await inputs[i].getAttribute('type');
        const name = await inputs[i].getAttribute('name');
        const placeholder = await inputs[i].getAttribute('placeholder');
        console.log(`Input ${i}: type=${type}, name=${name}, placeholder=${placeholder}`);
      }
      throw error;
    }

    // Step 3: Handle post-signup flow (might need to sign in)
    console.log('🔐 Step 3: Handling authentication...');
    
    if (page.url().includes('sign-in')) {
      console.log('Redirected to sign-in, logging in with new account...');
      await page.fill('input[type="email"]', testUser.email);
      await page.fill('input[type="password"]', testUser.password);
      await page.click('button[type="submit"]');
      await page.waitForLoadState('networkidle');
    }

    // Step 4: Navigate to Browse Shows
    console.log('📋 Step 4: Navigating to Browse Shows...');
    await page.goto('http://127.0.0.1:5174/shows');
    await page.waitForLoadState('networkidle');
    
    // Verify we're not redirected back to sign-in
    if (page.url().includes('sign-in')) {
      console.log('❌ Still being redirected to sign-in - authentication failed');
      await page.screenshot({ path: 'auth-failed.png' });
      throw new Error('Authentication failed - still redirecting to sign-in');
    }

    console.log('✅ Successfully authenticated and on Browse Shows page');
    await page.screenshot({ path: 'browse-shows-authenticated.png', fullPage: true });

    // Step 5: Wait for shows to load and analyze content
    console.log('⏳ Step 5: Waiting for shows data to load...');
    await page.waitForTimeout(3000);
    
    const pageContent = await page.textContent('body');
    console.log('📄 Page contains "show":', pageContent?.includes('show'));
    console.log('📄 Page contains "Show":', pageContent?.includes('Show'));
    console.log('📄 Page contains "trial":', pageContent?.includes('trial'));
    console.log('📄 Page contains "entry":', pageContent?.includes('entry'));
    
    // Look for show-related elements
    const showCards = await page.locator('[data-testid*="show"], .show-card, .card').count();
    const showLinks = await page.locator('a[href*="show"], a[href*="/shows/"]').count();
    const viewDetailsButtons = await page.locator('text=/view.*details/i, text=/details/i, button:has-text("Details")').count();
    
    console.log(`📊 Found ${showCards} show cards`);
    console.log(`🔗 Found ${showLinks} show links`);
    console.log(`👆 Found ${viewDetailsButtons} "View Details" buttons`);

    // Step 6: Try to find and click a show details link
    console.log('🎯 Step 6: Looking for show details navigation...');
    
    let detailsClicked = false;
    
    if (viewDetailsButtons > 0) {
      console.log('👆 Clicking "View Details" button...');
      await page.locator('text=/view.*details/i, text=/details/i, button:has-text("Details")').first().click();
      detailsClicked = true;
    } else if (showLinks > 0) {
      console.log('🔗 Clicking show link...');
      await page.locator('a[href*="show"], a[href*="/shows/"]').first().click();
      detailsClicked = true;
    } else {
      // Try to find any clickable show elements
      const clickableElements = await page.locator('*:has-text("show") a, *:has-text("Show") a, [role="button"]:has-text("show"), [role="button"]:has-text("Show")').count();
      console.log(`🔍 Found ${clickableElements} potentially clickable show elements`);
      
      if (clickableElements > 0) {
        console.log('👆 Clicking first clickable show element...');
        await page.locator('*:has-text("show") a, *:has-text("Show") a, [role="button"]:has-text("show"), [role="button"]:has-text("Show")').first().click();
        detailsClicked = true;
      }
    }

    if (detailsClicked) {
      await page.waitForLoadState('networkidle');
      
      const detailsUrl = page.url();
      console.log('📍 Show Details URL:', detailsUrl);
      await page.screenshot({ path: 'show-details-page.png', fullPage: true });
      
      // Step 7: Analyze Show Details page content
      console.log('🔍 Step 7: Analyzing Show Details page...');
      
      const detailsContent = await page.textContent('body');
      const hasNoShowsError = detailsContent?.toLowerCase().includes('no shows available');
      const hasNoShowsFound = detailsContent?.toLowerCase().includes('no shows found');
      const hasNotFound = detailsContent?.toLowerCase().includes('not found');
      
      console.log('🚨 Shows "no shows available":', hasNoShowsError);
      console.log('🚨 Shows "no shows found":', hasNoShowsFound);
      console.log('🚨 Shows "not found":', hasNotFound);
      
      if (hasNoShowsError || hasNoShowsFound || hasNotFound) {
        console.log('🎯 FOUND THE ISSUE: Show Details page shows no shows error!');
        
        // Try to identify the specific error message
        const errorElements = await page.locator('text=/no.*show/i, text=/not.*found/i, text=/no.*available/i').all();
        for (const element of errorElements) {
          const errorText = await element.textContent();
          console.log('🚨 Error message found:', errorText);
        }
        
        // Look for any error indicators in the URL or page structure
        console.log('📄 Page URL pattern:', detailsUrl);
        console.log('📄 URL includes show ID:', detailsUrl.includes('/show/') || detailsUrl.includes('/shows/'));
        
        // This is the main issue the user reported
        expect(detailsContent).not.toContain('no shows available');
        
      } else {
        console.log('✅ Show Details page appears to be working correctly');
        
        // Look for expected show details content
        const hasShowInfo = detailsContent?.includes('show') || detailsContent?.includes('Show');
        const hasTrialInfo = detailsContent?.includes('trial') || detailsContent?.includes('Trial');
        const hasDateInfo = detailsContent?.includes('2024') || detailsContent?.includes('2025');
        
        console.log('📄 Has show information:', hasShowInfo);
        console.log('📄 Has trial information:', hasTrialInfo);
        console.log('📄 Has date information:', hasDateInfo);
        
        expect(hasShowInfo || hasTrialInfo).toBeTruthy();
      }
      
    } else {
      console.log('⚠️ Could not find any show details links to click');
      console.log('📄 This might indicate an issue with the Browse Shows page itself');
      
      // Take a screenshot to see what's actually on the page
      await page.screenshot({ path: 'browse-shows-no-links.png', fullPage: true });
      
      // Log the full page structure for debugging
      const allLinks = await page.locator('a').all();
      console.log('🔗 All links on Browse Shows page:');
      for (const link of allLinks.slice(0, 10)) { // First 10 links
        const href = await link.getAttribute('href');
        const text = await link.textContent();
        console.log(`  - "${text?.trim()}" → ${href}`);
      }
    }

    // Step 8: Log console errors for debugging
    if (consoleErrors.length > 0) {
      console.log('🚨 Console Errors Detected:');
      consoleErrors.forEach(error => console.log(`  - ${error}`));
    }
    
    console.log('📝 Recent Console Messages (last 10):');
    consoleLogs.slice(-10).forEach(log => console.log(`  - ${log}`));
    
    console.log('🎉 Test completed successfully');
  });

  test('should test direct show details URL access', async ({ page }) => {
    console.log('🔗 Testing direct Show Details URL access...');
    
    // Try accessing a show details page directly
    // We'll need to figure out the URL pattern first
    await page.goto('http://127.0.0.1:5174/shows');
    
    if (page.url().includes('sign-in')) {
      console.log('⚠️ Need to authenticate first');
      // Use the same user from previous test if possible, or skip this test
      return;
    }
    
    await page.waitForLoadState('networkidle');
    
    // Try to extract a show ID from the browse shows page
    const showLinks = await page.locator('a[href*="show"], a[href*="/shows/"]').all();
    
    if (showLinks.length > 0) {
      const firstShowHref = await showLinks[0].getAttribute('href');
      console.log('🎯 Found show link:', firstShowHref);
      
      if (firstShowHref) {
        console.log('🔗 Testing direct navigation to:', firstShowHref);
        await page.goto(`http://127.0.0.1:5174${firstShowHref}`);
        await page.waitForLoadState('networkidle');
        
        const directUrl = page.url();
        console.log('📍 Direct access URL:', directUrl);
        
        const pageContent = await page.textContent('body');
        const hasNoShowsError = pageContent?.toLowerCase().includes('no shows available');
        
        console.log('🚨 Direct access shows "no shows available":', hasNoShowsError);
        
        await page.screenshot({ path: 'direct-show-details-access.png', fullPage: true });
        
        if (hasNoShowsError) {
          console.log('🎯 Issue confirmed: Direct show details access also shows "no shows available"');
        }
      }
    }
  });
});