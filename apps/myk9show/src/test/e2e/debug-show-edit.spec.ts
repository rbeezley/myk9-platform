import { test } from '@playwright/test';

test.describe('Show Edit Debug', () => {
  test('debug show edit functionality', async ({ page }) => {
    // Navigate to the app
    await page.goto('http://localhost:5173');
    
    // Wait for the app to load
    await page.waitForLoadState('networkidle');
    
    // Look for a "Browse Shows" or "Shows" link in navigation
    const showsLink = page.locator('nav a, header a').filter({ hasText: /shows/i }).first();
    
    if (await showsLink.isVisible()) {
      await showsLink.click();
      console.log('✅ Clicked Shows navigation link');
    } else {
      // Try direct navigation to shows page
      console.log('🔄 Navigating directly to /shows');
      await page.goto('http://localhost:5173/shows');
    }
    
    // Wait for shows page to load
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000); // Give time for React to render
    
    // Take a screenshot of the shows page
    await page.screenshot({ path: 'debug-shows-page.png', fullPage: true });
    console.log('📸 Screenshot taken: debug-shows-page.png');
    
    // Look for any show in the sidebar or main area
    const showElements = await page.locator('[data-testid*="show"], .show-item, a[href*="/shows/"]').all();
    console.log(`🔍 Found ${showElements.length} show-related elements`);
    
    // Try to find the first clickable show
    let firstShow = null;
    for (const element of showElements) {
      if (await element.isVisible()) {
        const text = await element.textContent();
        console.log(`📋 Show element text: "${text}"`);
        
        // Click the first show we find
        firstShow = element;
        break;
      }
    }
    
    if (!firstShow) {
      // Look for any link that contains "show" in the href
      firstShow = page.locator('a[href*="/shows/"]').first();
    }
    
    if (await firstShow.isVisible()) {
      console.log('🎯 Clicking on first show');
      await firstShow.click();
      
      // Wait for show details page to load
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      
      // Take screenshot of show details
      await page.screenshot({ path: 'debug-show-details.png', fullPage: true });
      console.log('📸 Screenshot taken: debug-show-details.png');
      
      // Look for the edit button (three dots menu or direct edit button)
      const editButtons = [
        page.locator('button').filter({ hasText: /edit/i }),
        page.locator('[data-testid="edit-show"]'),
        page.locator('button[aria-label*="edit"]'),
        page.locator('.more-menu button, [data-testid="more-menu"]'),
        page.getByRole('button', { name: /more/i }),
        page.locator('svg[data-testout="MoreVertical"], svg[class*="more"]').locator('..'),
      ];
      
      let editButton = null;
      for (const button of editButtons) {
        if (await button.first().isVisible()) {
          editButton = button.first();
          const text = await editButton.textContent();
          console.log(`🔘 Found potential edit button: "${text}"`);
          break;
        }
      }
      
      if (editButton) {
        console.log('🖱️ Clicking edit button');
        await editButton.click();
        await page.waitForTimeout(1000);
        
        // Check if it opened a menu (three dots)
        const editMenuItem = page.locator('button, a').filter({ hasText: /edit/i });
        if (await editMenuItem.isVisible() && editMenuItem !== editButton) {
          console.log('📝 Clicking Edit menu item');
          await editMenuItem.click();
        }
        
        // Wait for edit dialog to appear
        await page.waitForTimeout(2000);
        
        // Take screenshot of edit dialog
        await page.screenshot({ path: 'debug-edit-dialog.png', fullPage: true });
        console.log('📸 Screenshot taken: debug-edit-dialog.png');
        
        // Look for form fields in the edit dialog
        const nameField = page.locator('input[value], input[placeholder*="name" i], label:has-text("name") + input, input[id*="name"]').first();
        
        if (await nameField.isVisible()) {
          console.log('📝 Found name field, getting current value');
          const currentName = await nameField.inputValue();
          console.log(`📋 Current show name: "${currentName}"`);
          
          // Change the name
          const newName = `${currentName} [EDITED]`;
          console.log(`✏️ Changing name to: "${newName}"`);
          
          await nameField.fill(newName);
          await page.waitForTimeout(500);
          
          // Look for Save button
          const saveButtons = [
            page.locator('button').filter({ hasText: /save/i }),
            page.locator('button[type="submit"]'),
            page.locator('.dialog-footer button').first(),
            page.locator('[data-testid="save-show"]')
          ];
          
          let saveButton = null;
          for (const button of saveButtons) {
            if (await button.first().isVisible()) {
              saveButton = button.first();
              const text = await saveButton.textContent();
              console.log(`💾 Found save button: "${text}"`);
              break;
            }
          }
          
          if (saveButton) {
            console.log('💾 Clicking save button');
            
            // Listen for network requests to see what happens
            page.on('request', request => {
              if (request.url().includes('/api/') || request.method() !== 'GET') {
                console.log(`🌐 Request: ${request.method()} ${request.url()}`);
              }
            });
            
            page.on('response', response => {
              if (response.url().includes('/api/') || response.status() >= 400) {
                console.log(`📡 Response: ${response.status()} ${response.url()}`);
              }
            });
            
            // Listen for console messages
            page.on('console', msg => {
              const type = msg.type();
              const text = msg.text();
              if (type === 'error' || text.includes('🔄') || text.includes('✅') || text.includes('❌')) {
                console.log(`🖥️ Console ${type}: ${text}`);
              }
            });
            
            await saveButton.click();
            
            // Wait for any network requests to complete
            await page.waitForTimeout(3000);
            
            // Take screenshot after save
            await page.screenshot({ path: 'debug-after-save.png', fullPage: true });
            console.log('📸 Screenshot taken: debug-after-save.png');
            
            // Check if dialog closed
            const dialogStillOpen = await page.locator('.dialog, [role="dialog"], .modal').isVisible();
            console.log(`🔍 Dialog still open: ${dialogStillOpen}`);
            
            // Wait for show details page to update
            await page.waitForTimeout(2000);
            
            // Check if the name updated on the page
            const updatedNameElement = page.locator('h1, h2, .show-title').first();
            if (await updatedNameElement.isVisible()) {
              const displayedName = await updatedNameElement.textContent();
              console.log(`📋 Name displayed on page: "${displayedName}"`);
              console.log(`✅ Name updated: ${displayedName?.includes('[EDITED]')}`);
              
              // Take final screenshot
              await page.screenshot({ path: 'debug-final-result.png', fullPage: true });
              console.log('📸 Final screenshot taken: debug-final-result.png');
            }
          } else {
            console.log('❌ Could not find save button');
          }
        } else {
          console.log('❌ Could not find name field in edit dialog');
        }
      } else {
        console.log('❌ Could not find edit button');
      }
    } else {
      console.log('❌ No shows found to edit');
    }
  });
});