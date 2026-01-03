import { test } from '@playwright/test';

test.describe('Simple Show Edit Debug', () => {
  test('debug show edit - simple', async ({ page }) => {
    console.log('🔍 Starting simple show edit debug...');
    
    // Navigate directly to the app
    await page.goto('http://localhost:5173');
    console.log('📍 Navigated to localhost:5173');
    
    // Wait for app to load
    await page.waitForSelector('#root', { timeout: 10000 });
    console.log('✅ App container loaded');
    
    // Take initial screenshot
    await page.screenshot({ path: 'debug-initial.png' });
    console.log('📸 Initial screenshot taken');
    
    // Navigate to shows page
    await page.goto('http://localhost:5173/shows');
    await page.waitForLoadState('networkidle');
    console.log('📍 Navigated to shows page');
    
    // Take shows page screenshot
    await page.screenshot({ path: 'debug-shows-page.png' });
    console.log('📸 Shows page screenshot taken');
    
    // Look for any show link or card
    const showLinks = await page.locator('a[href*="/shows/"]').all();
    console.log(`🔍 Found ${showLinks.length} show links`);
    
    if (showLinks.length > 0) {
      // Click the first show
      console.log('🖱️ Clicking first show');
      await showLinks[0].click();
      
      // Wait for show details page
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: 'debug-show-details.png' });
      console.log('📸 Show details screenshot taken');
      
      // Look for three dots menu or edit button
      const moreButton = page.locator('button').filter({ hasText: /more/i }).or(
        page.locator('svg[class*="more"]').locator('..')
      ).or(
        page.locator('[data-testid*="more"]')
      ).first();
      
      if (await moreButton.isVisible()) {
        console.log('🔘 Found more button, clicking');
        await moreButton.click();
        await page.waitForTimeout(1000);
        
        // Look for edit option in menu
        const editOption = page.locator('button, a').filter({ hasText: /edit/i });
        if (await editOption.isVisible()) {
          console.log('📝 Found edit option, clicking');
          await editOption.click();
          await page.waitForTimeout(2000);
          
          // Take screenshot of edit dialog
          await page.screenshot({ path: 'debug-edit-dialog.png' });
          console.log('📸 Edit dialog screenshot taken');
          
          // Look for form fields
          const nameInput = page.locator('input').first();
          if (await nameInput.isVisible()) {
            const currentValue = await nameInput.inputValue();
            console.log(`📋 Current name value: "${currentValue}"`);
            
            // Change the value
            const newValue = currentValue + ' [EDITED]';
            await nameInput.fill(newValue);
            console.log(`✏️ Changed to: "${newValue}"`);
            
            // Look for save button
            const saveButton = page.locator('button').filter({ hasText: /save/i }).first();
            if (await saveButton.isVisible()) {
              console.log('💾 Found save button, clicking');
              await saveButton.click();
              
              // Wait and take final screenshot
              await page.waitForTimeout(3000);
              await page.screenshot({ path: 'debug-after-save.png' });
              console.log('📸 After save screenshot taken');
              
              // Check if the change is reflected
              const pageContent = await page.content();
              const hasEdit = pageContent.includes('[EDITED]');
              console.log(`✅ Edit reflected on page: ${hasEdit}`);
            } else {
              console.log('❌ Save button not found');
            }
          } else {
            console.log('❌ Name input not found');
          }
        } else {
          console.log('❌ Edit option not found in menu');
        }
      } else {
        console.log('❌ More button not found');
      }
    } else {
      console.log('❌ No show links found');
    }
    
    console.log('🏁 Test completed');
  });
});