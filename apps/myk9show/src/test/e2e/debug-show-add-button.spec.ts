import { test } from '@playwright/test';

test('Debug show add button visibility', async ({ page }) => {
  // Listen for console logs first
  const consoleLogs: string[] = [];
  page.on('console', msg => {
    const text = msg.text();
    consoleLogs.push(text);
    if (text.includes('🔐 RBAC') || 
        text.includes('🎪 ShowGroupedSidebar') ||
        text.includes('permission') ||
        text.includes('hasPermission') ||
        text.includes('show:create')) {
      console.log('CONSOLE:', text);
    }
  });
  
  // Navigate to the application
  console.log('Navigating to http://127.0.0.1:5176');
  await page.goto('http://127.0.0.1:5176');
  await page.waitForLoadState('networkidle');
  
  // Take screenshot of landing page
  await page.screenshot({ path: 'd:/AI-Projects/myK9Show-Windsurf/screenshots/debug-landing.png' });
  
  // Wait a moment for any initial logs
  await page.waitForTimeout(2000);
  
  // Navigate directly to browse shows (public access)
  console.log('Navigating directly to browse shows...');
  await page.goto('http://127.0.0.1:5176/browse-shows');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  
  await page.screenshot({ path: 'd:/AI-Projects/myK9Show-Windsurf/screenshots/debug-browse-shows.png' });
  
  console.log('Browse shows URL:', page.url());
  console.log('Browse shows title:', await page.title());
  
  // Look for a show to click on
  const showCard = page.locator('[class*="show"], [data-testid*="show"], a[href*="/shows/"]').first();
  const showLinks = page.locator('a[href*="/shows/"]');
  
  console.log('Show cards count:', await showCard.count());
  console.log('Show links count:', await showLinks.count());
  
  if (await showCard.isVisible({ timeout: 5000 })) {
    console.log('Found show card, clicking...');
    await showCard.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000); // Give time for RBAC to load
    
    await page.screenshot({ path: 'd:/AI-Projects/myK9Show-Windsurf/screenshots/debug-show-details.png' });
    
    // Check if we're on a show details page
    console.log('Current URL:', page.url());
    console.log('Page title:', await page.title());
    
    // Look for sidebar
    const sidebar = page.locator('[class*="sidebar"], [data-testid*="sidebar"]');
    const addButton = page.locator('button:has-text("Add")');
    
    console.log('Sidebar found:', await sidebar.isVisible());
    console.log('Add button found:', await addButton.isVisible());
    
    // Wait a bit more for any async loading
    await page.waitForTimeout(2000);
    
  } else if (await showLinks.first().isVisible({ timeout: 5000 })) {
    console.log('Found show link, clicking...');
    await showLinks.first().click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    await page.screenshot({ path: 'd:/AI-Projects/myK9Show-Windsurf/screenshots/debug-show-details.png' });
    
    console.log('Current URL:', page.url());
    console.log('Page title:', await page.title());
    
    const sidebar = page.locator('[class*="sidebar"], [data-testid*="sidebar"]');
    const addButton = page.locator('button:has-text("Add")');
    
    console.log('Sidebar found:', await sidebar.isVisible());
    console.log('Add button found:', await addButton.isVisible());
    
  } else {
    console.log('No show cards found, trying direct navigation');
    await page.goto('http://127.0.0.1:5176/shows/1');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'd:/AI-Projects/myK9Show-Windsurf/screenshots/debug-direct-navigation.png' });
    
    console.log('Direct navigation URL:', page.url());
    console.log('Direct navigation title:', await page.title());
    
    const sidebar = page.locator('[class*="sidebar"], [data-testid*="sidebar"]');
    const addButton = page.locator('button:has-text("Add")');
    
    console.log('Sidebar found:', await sidebar.isVisible());
    console.log('Add button found:', await addButton.isVisible());
  }
  
  // Now try to login to test authenticated user permissions
  console.log('\\nTesting authenticated user permissions...');
  
  // Navigate to login page
  await page.goto('http://127.0.0.1:5176/login');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  
  await page.screenshot({ path: 'd:/AI-Projects/myK9Show-Windsurf/screenshots/debug-login-page.png' });
  
  // Try to login with test credentials  
  const emailInput = page.locator('input[type="email"]');
  const passwordInput = page.locator('input[type="password"]');
  const submitButton = page.locator('button[type="submit"]');
  
  if (await emailInput.isVisible({ timeout: 5000 })) {
    console.log('Found login form, attempting login...');
    await emailInput.fill('admin@test.com');
    await passwordInput.fill('admin123');
    await submitButton.click();
    
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000); // Give time for auth to complete
    
    console.log('After login URL:', page.url());
    await page.screenshot({ path: 'd:/AI-Projects/myK9Show-Windsurf/screenshots/debug-after-login.png' });
    
    // Now try to navigate to a show details page as authenticated user
    console.log('Navigating to show details as authenticated user...');
    await page.goto('http://127.0.0.1:5176/shows/1');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000); // Give more time for RBAC to load
    
    await page.screenshot({ path: 'd:/AI-Projects/myK9Show-Windsurf/screenshots/debug-authenticated-show-details.png' });
    
    console.log('Authenticated show details URL:', page.url());
    console.log('Authenticated show details title:', await page.title());
    
    // Look for sidebar and add button as authenticated user
    const authSidebar = page.locator('[class*="sidebar"], [data-testid*="sidebar"]');
    const authAddButton = page.locator('button:has-text("Add")');
    
    console.log('Authenticated - Sidebar found:', await authSidebar.isVisible());
    console.log('Authenticated - Add button found:', await authAddButton.isVisible());
    
    // Wait a bit more for any async loading
    await page.waitForTimeout(3000);
    
  } else {
    console.log('Login form not found');
  }
  
  // Final screenshot and log summary
  await page.screenshot({ path: 'd:/AI-Projects/myK9Show-Windsurf/screenshots/debug-final-state.png' });
  
  console.log('\\n=== CONSOLE LOG SUMMARY ===');
  consoleLogs.forEach((log, index) => {
    if (log.includes('🔐') || log.includes('🎪') || log.includes('permission') || log.includes('show:create')) {
      console.log(`${index + 1}. ${log}`);
    }
  });
});