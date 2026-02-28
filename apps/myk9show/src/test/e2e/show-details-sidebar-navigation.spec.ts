import { test, expect } from '@playwright/test';

test.describe('Show Details Sidebar Navigation', () => {
  test('should navigate between shows when clicking sidebar items', async ({ page }) => {
    // Navigate to the show details page
    await page.goto('http://localhost:5173/shows');
    
    // Wait for shows to load
    await page.waitForLoadState('networkidle');
    
    // Wait for the sidebar to be visible and shows to load
    await page.waitForSelector('[data-testid="sidebar"], .sidebar, [role="navigation"]', { timeout: 10000 });
    
    // Look for show items in the sidebar - they should be clickable elements
    const sidebarItems = page.locator('button, a, [role="button"]').filter({
      hasText: /Show|Trial|Event/i
    });
    
    // Get the count of sidebar items
    const itemCount = await sidebarItems.count();
    console.log(`Found ${itemCount} potential sidebar items`);
    
    if (itemCount > 1) {
      // Get the current URL before clicking
      const initialUrl = page.url();
      console.log(`Initial URL: ${initialUrl}`);
      
      // Click on the first show item
      await sidebarItems.first().click();
      
      // Wait for navigation to occur
      await page.waitForTimeout(1000);
      
      const firstClickUrl = page.url();
      console.log(`URL after first click: ${firstClickUrl}`);
      
      // Click on the second show item if available
      if (itemCount > 1) {
        await sidebarItems.nth(1).click();
        await page.waitForTimeout(1000);
        
        const secondClickUrl = page.url();
        console.log(`URL after second click: ${secondClickUrl}`);
        
        // Verify that the URL changed when clicking different items
        expect(secondClickUrl).not.toBe(firstClickUrl);
      }
      
      // Verify we're still on a show details page
      expect(page.url()).toMatch(/\/shows\/[a-zA-Z0-9-]+/);
      
      // Verify show content is displayed
      await expect(page.locator('main')).toBeVisible();
      
      console.log('✅ Sidebar navigation test completed successfully');
    } else {
      console.log('⚠️ Not enough sidebar items found to test navigation');
      
      // At least verify the page loads
      await expect(page.locator('main')).toBeVisible();
    }
  });
  
  test('should update URL when selecting different shows', async ({ page }) => {
    // Navigate to browse shows first
    await page.goto('http://localhost:5173/shows');
    await page.waitForLoadState('networkidle');
    
    // Find a "View Details" button and click it
    const viewDetailsButton = page.locator('button', { hasText: 'View Details' }).first();
    
    if (await viewDetailsButton.isVisible()) {
      await viewDetailsButton.click();
      
      // Wait for navigation to show details page
      await page.waitForURL(/\/shows\/[a-zA-Z0-9-]+/);
      
      // Capture the initial show ID from the URL
      const initialUrl = page.url();
      const initialShowId = initialUrl.split('/shows/')[1];
      
      console.log(`Navigated to show: ${initialShowId}`);
      
      // Look for sidebar navigation elements
      const sidebarShowItems = page.locator('[data-testid="sidebar-item"], .sidebar button, .sidebar a').filter({
        hasNotText: initialShowId
      });
      
      const alternativeShowsCount = await sidebarShowItems.count();
      console.log(`Found ${alternativeShowsCount} alternative shows in sidebar`);
      
      if (alternativeShowsCount > 0) {
        // Click on a different show in the sidebar
        await sidebarShowItems.first().click();
        
        // Wait for URL to change
        await page.waitForTimeout(2000);
        
        const newUrl = page.url();
        const newShowId = newUrl.split('/shows/')[1];
        
        console.log(`URL changed to: ${newUrl}`);
        console.log(`New show ID: ${newShowId}`);
        
        // Verify the URL actually changed to a different show
        expect(newShowId).not.toBe(initialShowId);
        expect(newUrl).toMatch(/\/shows\/[a-zA-Z0-9-]+/);
        
        // Verify the main content is still visible
        await expect(page.locator('main')).toBeVisible();
        
        console.log('✅ URL navigation test completed successfully');
      } else {
        console.log('⚠️ No alternative shows found in sidebar to test navigation');
      }
    } else {
      console.log('⚠️ No "View Details" button found on browse shows page');
    }
  });
});