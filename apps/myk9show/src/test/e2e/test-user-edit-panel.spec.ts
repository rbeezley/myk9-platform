import { test } from '@playwright/test';

test.describe('UserEditPanel Tests', () => {
  test('should display UserEditPanel when editing user', async ({ page }) => {
    // Navigate to the application on the correct port
    console.log('Navigating to http://127.0.0.1:5174');
    await page.goto('http://127.0.0.1:5174');
    await page.waitForLoadState('networkidle');
    
    // Take screenshot of landing page
    await page.screenshot({ path: 'screenshots/debug-landing.png', fullPage: true });
    console.log('Landing page screenshot saved');
    
    // Look for navigation or user links
    const usersLink = page.locator('a[href*="/people"], a:has-text("Users"), a:has-text("People")');
    if (await usersLink.count() > 0) {
      await usersLink.first().click();
      await page.waitForLoadState('networkidle');
      console.log('Clicked on users/people link');
      
      // Take screenshot after navigation
      await page.screenshot({ path: 'screenshots/debug-users-page.png', fullPage: true });
      
      // Look for a user row or user link to click
      const userRow = page.locator('[data-testid="user-row"], .user-row, tr, .list-item').first();
      if (await userRow.count() > 0) {
        await userRow.click();
        await page.waitForLoadState('networkidle');
        console.log('Clicked on user row');
        
        // Take screenshot of user details page
        await page.screenshot({ path: 'screenshots/debug-user-details.png', fullPage: true });
        
        // Look for edit button or dropdown menu
        const editButton = page.locator('button:has-text("Edit"), [data-testid="edit-button"]');
        const dropdownTrigger = page.locator('[data-testid="dropdown-trigger"], button:has([class*="more"]), button:has-text("⋮"), button:has([class*="vertical"])');
        
        if (await editButton.count() > 0) {
          await editButton.first().click();
          console.log('Clicked edit button');
        } else if (await dropdownTrigger.count() > 0) {
          await dropdownTrigger.first().click();
          console.log('Clicked dropdown trigger');
          
          // Wait for dropdown menu and click Edit User
          const editUserOption = page.locator('text="Edit User"');
          if (await editUserOption.count() > 0) {
            await editUserOption.click();
            console.log('Clicked Edit User from dropdown');
          }
        }
        
        // Wait for edit panel to appear
        await page.waitForTimeout(1000);
        
        // Check if UserEditPanel is displayed
        // const editPanel = page.locator('[data-testid="user-edit-panel"], .user-edit-panel, [class*="edit-panel"]');
        const editTitle = page.locator('text="Edit User"');
        const tabsContainer = page.locator('[role="tablist"], .tabs-container, [class*="tabs"]');
        
        // Take screenshot of edit panel
        await page.screenshot({ path: 'screenshots/debug-edit-panel.png', fullPage: true });
        
        // Verify UserEditPanel elements are present
        console.log('Checking for edit panel elements...');
        
        if (await editTitle.count() > 0) {
          console.log('✅ Edit User title found');
        } else {
          console.log('❌ Edit User title not found');
        }
        
        if (await tabsContainer.count() > 0) {
          console.log('✅ Tabs container found');
          
          // Check for specific tabs
          const basicInfoTab = page.locator('text="Basic Info"');
          const contactTab = page.locator('text="Contact"');
          const qualificationsTab = page.locator('text="Qualifications"');
          
          if (await basicInfoTab.count() > 0) console.log('✅ Basic Info tab found');
          if (await contactTab.count() > 0) console.log('✅ Contact tab found');
          if (await qualificationsTab.count() > 0) console.log('✅ Qualifications tab found');
        } else {
          console.log('❌ Tabs container not found');
        }
        
        // Check for Premiumd design elements
        const gradientTabs = page.locator('[class*="gradient"], [style*="gradient"]');
        if (await gradientTabs.count() > 0) {
          console.log('✅ Gradient styling found');
        }
        
        // Log any visible text for debugging
        const allText = await page.textContent('body');
        if (allText?.includes('Edit Profile')) {
          console.log('❌ Still showing old "Edit Profile" dialog');
        } else if (allText?.includes('Edit User')) {
          console.log('✅ Showing new "Edit User" panel');
        }
        
      } else {
        console.log('No user rows found');
      }
    } else {
      console.log('No users/people link found, checking for direct user navigation');
      
      // Try navigating directly to a user page if users link not found
      await page.goto('http://127.0.0.1:5174/people');
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: 'screenshots/debug-direct-users.png', fullPage: true });
    }
    
    // Final screenshot
    await page.screenshot({ path: 'screenshots/debug-final-state.png', fullPage: true });
    console.log('Test completed - check screenshots folder for results');
  });
});
