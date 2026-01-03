import { test } from '@playwright/test';

test.describe('Show Details Issue Investigation', () => {
  test('should investigate Browse Shows page and Show Details navigation', async ({ page }) => {
    const consoleLogs: string[] = [];
    const consoleErrors: string[] = [];
    const networkRequests: string[] = [];
    
    // Capture all console messages and network requests
    page.on('console', msg => {
      const message = `${msg.type()}: ${msg.text()}`;
      consoleLogs.push(message);
      if (msg.type() === 'error') {
        consoleErrors.push(message);
      }
    });
    
    page.on('request', request => {
      networkRequests.push(`${request.method()} ${request.url()}`);
    });

    console.log('🕵️ Starting Show Details issue investigation...');

    // Step 1: Go directly to Browse Shows to see what happens
    console.log('📋 Step 1: Testing Browse Shows page access...');
    await page.goto('http://127.0.0.1:5174/browse-shows');
    await page.waitForLoadState('networkidle');
    
    const currentUrl = page.url();
    console.log('📍 Current URL:', currentUrl);
    
    if (currentUrl.includes('sign-in')) {
      console.log('🔒 Redirected to sign-in (expected for protected route)');
      
      // Try to create a quick test user or sign in
      console.log('⚡ Creating quick test account...');
      
      // Go to sign-up first
      await page.goto('http://127.0.0.1:5174/sign-up');
      await page.waitForLoadState('networkidle');
      
      const quickEmail = `quicktest${Date.now()}@example.com`;
      const quickPassword = 'TestUser123!';
      
      console.log('📧 Quick test email:', quickEmail);
      
      try {
        await page.fill('input[type="email"]', quickEmail);
        await page.fill('input[type="password"]', quickPassword);
        await page.click('button[type="submit"]');
        
        // Wait a bit and see what happens
        await page.waitForTimeout(2000);
        
        const afterSignupUrl = page.url();
        console.log('📍 After signup URL:', afterSignupUrl);
        
        // If still on signup page, there might be an error
        if (afterSignupUrl.includes('sign-up')) {
          // Look for error messages
          const errorText = await page.textContent('body');
          console.log('⚠️ Still on signup page, checking for errors...');
          
          if (errorText?.includes('error') || errorText?.includes('Error')) {
            console.log('🚨 Error detected in signup process');
          }
          
          // Try signing in instead
          console.log('🔄 Trying sign-in instead...');
          await page.goto('http://127.0.0.1:5174/sign-in');
          await page.fill('input[type="email"]', quickEmail);
          await page.fill('input[type="password"]', quickPassword);
          await page.click('button[type="submit"]');
          await page.waitForTimeout(2000);
        }
        
        // Try to access Browse Shows again
        await page.goto('http://127.0.0.1:5174/browse-shows');
        await page.waitForLoadState('networkidle');
        
      } catch (authError) {
        console.log('❌ Authentication failed:', authError);
        console.log('⏭️ Skipping to mock/direct testing approach...');
        
        // Since auth is failing, let's try to understand what's on the pages anyway
        await page.goto('http://127.0.0.1:5174/');
        await page.waitForLoadState('networkidle');
      }
    }

    // Step 2: Analyze the current page content
    console.log('🔍 Step 2: Analyzing current page content...');
    
    const finalUrl = page.url();
    console.log('📍 Final URL:', finalUrl);
    await page.screenshot({ path: 'current-page-state.png', fullPage: true });
    
    const pageContent = await page.textContent('body');
    const isOnBrowseShows = finalUrl.includes('browse-shows') || pageContent?.includes('Browse Shows');
    const isOnSignIn = finalUrl.includes('sign-in');
    const isOnHome = finalUrl.includes('127.0.0.1:5174/') && !finalUrl.includes('/sign');
    
    console.log('📄 Is on Browse Shows:', isOnBrowseShows);
    console.log('📄 Is on Sign In:', isOnSignIn);
    console.log('📄 Is on Home:', isOnHome);
    
    // Step 3: If we're on Browse Shows, test the show details navigation
    if (isOnBrowseShows) {
      console.log('✅ Successfully on Browse Shows page!');
      
      // Look for show-related content
      const showContent = {
        hasShowText: pageContent?.includes('show') || pageContent?.includes('Show'),
        hasTrialText: pageContent?.includes('trial') || pageContent?.includes('Trial'),
        hasEntryText: pageContent?.includes('entry') || pageContent?.includes('Entry')
      };
      
      console.log('📊 Show content analysis:', showContent);
      
      // Look for interactive elements
      const showElements = await page.locator('[data-testid*="show"], .show-card, .card, a[href*="show"], a[href*="/shows/"]').count();
      const detailsButtons = await page.locator('text=/view.*details/i, text=/details/i, button:has-text("Details")').count();
      const clickableElements = await page.locator('a, button, [role="button"]').count();
      
      console.log(`🔗 Found ${showElements} show elements`);
      console.log(`👆 Found ${detailsButtons} details buttons`);
      console.log(`🖱️ Found ${clickableElements} clickable elements`);
      
      // Try to find and click show details
      if (showElements > 0 || detailsButtons > 0) {
        console.log('🎯 Attempting to click show details...');
        
        let clickTarget = null;
        
        if (detailsButtons > 0) {
          clickTarget = page.locator('text=/view.*details/i, text=/details/i, button:has-text("Details")').first();
          console.log('👆 Clicking details button...');
        } else if (showElements > 0) {
          clickTarget = page.locator('[data-testid*="show"], .show-card, .card, a[href*="show"], a[href*="/shows/"]').first();
          console.log('🔗 Clicking show element...');
        }
        
        if (clickTarget) {
          // Get the href before clicking (if it's a link)
          const href = await clickTarget.getAttribute('href').catch(() => null);
          console.log('🔗 Target href:', href);
          
          await clickTarget.click();
          await page.waitForLoadState('networkidle');
          
          const detailsUrl = page.url();
          console.log('📍 Show Details URL:', detailsUrl);
          await page.screenshot({ path: 'show-details-result.png', fullPage: true });
          
          // Step 4: Analyze Show Details page
          console.log('🔍 Step 4: Analyzing Show Details page...');
          
          const detailsContent = await page.textContent('body');
          const detailsIssues = {
            hasNoShowsAvailable: detailsContent?.toLowerCase().includes('no shows available'),
            hasNoShowsFound: detailsContent?.toLowerCase().includes('no shows found'),
            hasNotFound: detailsContent?.toLowerCase().includes('not found'),
            hasErrorMessage: detailsContent?.toLowerCase().includes('error')
          };
          
          console.log('🚨 Show Details issues detected:', detailsIssues);
          
          if (detailsIssues.hasNoShowsAvailable) {
            console.log('🎯 CONFIRMED: Show Details page shows "no shows available"!');
            console.log('🔍 This is the exact issue the user reported');
            
            // Try to find the specific error message
            const errorElements = await page.locator('text=/no.*show.*available/i, text=/no.*show/i').all();
            for (const element of errorElements) {
              const errorText = await element.textContent();
              console.log('🚨 Specific error message:', errorText);
            }
            
            // Check the URL structure to understand routing
            console.log('🔗 URL analysis:');
            console.log('  - Contains show ID:', detailsUrl.includes('/show/') || detailsUrl.includes('/shows/'));
            console.log('  - URL pattern:', detailsUrl.replace('http://127.0.0.1:5174', ''));
            
          } else if (Object.values(detailsIssues).some(Boolean)) {
            console.log('⚠️ Show Details page has some issues but not the specific "no shows available" error');
          } else {
            console.log('✅ Show Details page appears to be working correctly');
            
            // Check for expected content
            const hasExpectedContent = detailsContent?.includes('show') || 
                                     detailsContent?.includes('Show') ||
                                     detailsContent?.includes('trial') ||
                                     detailsContent?.includes('date');
            
            console.log('📄 Has expected show details content:', hasExpectedContent);
          }
        }
        
      } else {
        console.log('⚠️ No show elements or details buttons found on Browse Shows page');
        console.log('📄 This might indicate the Browse Shows page itself has issues');
        
        // Try to understand what's actually on the page
        const allText = await page.textContent('body');
        console.log('📄 Page content preview:', allText?.substring(0, 200) + '...');
      }
      
    } else if (isOnSignIn) {
      console.log('🔒 Still on sign-in page - authentication is required');
      console.log('ℹ️ This confirms the page is properly protected');
      
    } else if (isOnHome) {
      console.log('🏠 On home page - can explore from here');
      
      // Try to navigate to browse shows from home page
      const browseShowsLink = await page.locator('a[href*="browse"], text=/browse.*show/i, text=/show/i').count();
      console.log(`🔗 Found ${browseShowsLink} potential browse shows links on home page`);
      
    } else {
      console.log('❓ On unexpected page:', finalUrl);
    }

    // Step 5: Log debugging information
    console.log('🚨 Console Errors:', consoleErrors.length);
    consoleErrors.forEach(error => console.log(`  - ${error}`));
    
    console.log('📝 Recent Console Messages (last 5):');
    consoleLogs.slice(-5).forEach(log => console.log(`  - ${log}`));
    
    console.log('🌐 Network Requests (sample):');
    networkRequests.filter(req => req.includes('show') || req.includes('api')).slice(0, 5).forEach(req => console.log(`  - ${req}`));
    
    console.log('🎉 Investigation completed');
  });

  test('should test show details URL patterns directly', async ({ page }) => {
    console.log('🔗 Testing show details URL patterns...');
    
    // Try common show details URL patterns
    const testUrls = [
      'http://127.0.0.1:5174/show/test-id',
      'http://127.0.0.1:5174/shows/test-id',
      'http://127.0.0.1:5174/show-details/test-id'
    ];
    
    for (const testUrl of testUrls) {
      console.log(`🔗 Testing URL: ${testUrl}`);
      await page.goto(testUrl);
      await page.waitForLoadState('networkidle');
      
      const resultUrl = page.url();
      const content = await page.textContent('body');
      const hasNoShowsError = content?.toLowerCase().includes('no shows available');
      
      console.log(`  - Result URL: ${resultUrl}`);
      console.log(`  - Has "no shows available": ${hasNoShowsError}`);
      
      if (hasNoShowsError) {
        console.log('🎯 Found "no shows available" error with direct URL access!');
      }
    }
  });
});