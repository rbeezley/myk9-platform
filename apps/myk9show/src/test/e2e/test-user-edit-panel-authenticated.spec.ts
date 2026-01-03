import { test } from '@playwright/test';
import { TestSetup } from './helpers/testSetup';

test.describe('UserEditPanel Authentication Tests', () => {
  test('should display UserEditPanel with Apple styling after authentication', async ({ page }) => {
    const testSetup = new TestSetup(page);
    
    try {
      // Sign in as admin user
      console.log('🔐 Signing in as admin...');
      await testSetup.signIn('admin');
      
      // Take screenshot after login
      await page.screenshot({ path: 'screenshots/debug-after-login.png', fullPage: true });
      console.log('📸 Screenshot saved: debug-after-login.png');
      
      // Wait for the page to fully load
      await page.waitForLoadState('networkidle');
      
      // Look for navigation to users/people section
      console.log('🔍 Looking for navigation options...');
      
      // Try multiple navigation patterns to find users
      const navOptions = [
        'nav a[href*="users"]',
        'nav a[href*="people"]', 
        'a:has-text("Users")',
        'a:has-text("People")',
        '[data-testid="users-nav"]',
        '[data-testid="people-nav"]'
      ];
      
      let foundNav = false;
      for (const selector of navOptions) {
        const navLink = page.locator(selector);
        if (await navLink.count() > 0) {
          console.log(`✅ Found navigation: ${selector}`);
          await navLink.first().click();
          await page.waitForLoadState('networkidle');
          foundNav = true;
          break;
        }
      }
      
      if (!foundNav) {
        console.log('⚠️ No user navigation found, trying direct URL...');
        await page.goto('http://127.0.0.1:5174/users');
        await page.waitForLoadState('networkidle');
      }
      
      // Take screenshot of users page
      await page.screenshot({ path: 'screenshots/debug-browse-users.png', fullPage: true });
      console.log('📸 Screenshot saved: debug-browse-users.png');
      
      // Look for user entries/rows
      console.log('👥 Looking for user entries...');
      const userSelectors = [
        '[data-testid="user-row"]',
        '.user-row',
        'tbody tr',
        '[class*="user"]',
        'a[href*="/users/"]'
      ];
      
      let userFound = false;
      for (const selector of userSelectors) {
        const userElements = page.locator(selector);
        if (await userElements.count() > 0) {
          console.log(`✅ Found user elements: ${selector} (${await userElements.count()})`);
          await userElements.first().click();
          await page.waitForLoadState('networkidle');
          userFound = true;
          break;
        }
      }
      
      if (!userFound) {
        console.log('⚠️ No user entries found, trying to create or find test user...');
        
        // Try navigating to a specific user ID if we can find one
        const userLinks = await page.locator('a[href*="/users/"]').all();
        if (userLinks.length > 0) {
          await userLinks[0].click();
          await page.waitForLoadState('networkidle');
          userFound = true;
        }
      }
      
      if (!userFound) {
        console.log('❌ Could not find any users to test with');
        await page.screenshot({ path: 'screenshots/debug-no-users-found.png', fullPage: true });
        return;
      }
      
      // Take screenshot of user details page
      await page.screenshot({ path: 'screenshots/debug-user-details.png', fullPage: true });
      console.log('📸 Screenshot saved: debug-user-details.png');
      
      // Now look for the edit button or dropdown
      console.log('✏️ Looking for edit options...');
      
      // First try to find a dropdown menu trigger
      const dropdownSelectors = [
        '[data-testid="dropdown-trigger"]',
        'button:has([data-testid="more-vertical"])',
        'button:has(.lucide-more-vertical)',
        'button:has-text("⋮")',
        '.apple-people-actions button',
        '[class*="dropdown"] button'
      ];
      
      let editPanelOpened = false;
      for (const selector of dropdownSelectors) {
        const dropdown = page.locator(selector);
        if (await dropdown.count() > 0) {
          console.log(`✅ Found dropdown trigger: ${selector}`);
          await dropdown.first().click();
          await page.waitForTimeout(500); // Wait for dropdown to appear
          
          // Look for "Edit User" option
          const editUserOption = page.locator('text="Edit User"');
          if (await editUserOption.count() > 0) {
            console.log('✅ Found "Edit User" option');
            await editUserOption.click();
            await page.waitForTimeout(1000); // Wait for panel to appear
            editPanelOpened = true;
            break;
          }
        }
      }
      
      // If dropdown didn't work, try direct edit button
      if (!editPanelOpened) {
        const editButtonSelectors = [
          '[data-testid="edit-button"]',
          'button:has-text("Edit")',
          'button:has-text("Edit User")',
          '.edit-button'
        ];
        
        for (const selector of editButtonSelectors) {
          const editButton = page.locator(selector);
          if (await editButton.count() > 0) {
            console.log(`✅ Found edit button: ${selector}`);
            await editButton.first().click();
            await page.waitForTimeout(1000);
            editPanelOpened = true;
            break;
          }
        }
      }
      
      // Take screenshot after attempting to open edit panel
      await page.screenshot({ path: 'screenshots/debug-edit-panel-attempt.png', fullPage: true });
      console.log('📸 Screenshot saved: debug-edit-panel-attempt.png');
      
      if (!editPanelOpened) {
        console.log('❌ Could not find edit button or dropdown');
        // Log all buttons for debugging
        const allButtons = await page.locator('button').all();
        console.log(`Found ${allButtons.length} buttons on page`);
        for (let i = 0; i < Math.min(allButtons.length, 10); i++) {
          const text = await allButtons[i].textContent();
          console.log(`Button ${i}: "${text}"`);
        }
        return;
      }
      
      console.log('🎉 Edit panel opened! Now checking UserEditPanel elements...');
      
      // Check for UserEditPanel specific elements
      const checks = {
        editTitle: await page.locator('text="Edit User"').count() > 0,
        subtitle: await page.locator('text*="Editing profile for"').count() > 0,
        tabsContainer: await page.locator('[role="tablist"], .tabs-list, [class*="tabs"]').count() > 0,
        basicInfoTab: await page.locator('text="Basic Info"').count() > 0,
        contactTab: await page.locator('text="Contact"').count() > 0,
        qualificationsTab: await page.locator('text="Qualifications"').count() > 0,
        applePanel: await page.locator('[class*="apple-"], [class*="gradient"]').count() > 0
      };
      
      console.log('🔍 UserEditPanel Elements Check:');
      Object.entries(checks).forEach(([key, found]) => {
        console.log(`  ${found ? '✅' : '❌'} ${key}: ${found}`);
      });
      
      // Check if old "Edit Profile" dialog is still showing (should not be)
      const oldDialog = await page.locator('text="Edit Profile"').count();
      if (oldDialog > 0) {
        console.log('❌ ISSUE: Still showing old "Edit Profile" dialog!');
      } else {
        console.log('✅ Good: No old "Edit Profile" dialog found');
      }
      
      // Take final screenshot of the edit panel
      await page.screenshot({ path: 'screenshots/debug-final-edit-panel.png', fullPage: true });
      console.log('📸 Screenshot saved: debug-final-edit-panel.png');
      
      // Check for Apple design elements
      const appleDesignElements = {
        solidBackground: await page.locator('[style*="background"], [class*="bg-"]').count() > 0,
        gradientTabs: await page.locator('[style*="gradient"], [class*="gradient"]').count() > 0,
        appleClasses: await page.locator('[class*="apple-"]').count() > 0
      };
      
      console.log('🍎 Apple Design Elements Check:');
      Object.entries(appleDesignElements).forEach(([key, found]) => {
        console.log(`  ${found ? '✅' : '❌'} ${key}: ${found}`);
      });
      
      // Log page content for debugging
      const pageText = await page.textContent('body');
      console.log('📄 Page contains:');
      if (pageText?.includes('Edit User')) console.log('  ✅ "Edit User" text');
      if (pageText?.includes('Basic Info')) console.log('  ✅ "Basic Info" tab');
      if (pageText?.includes('Contact')) console.log('  ✅ "Contact" tab');
      if (pageText?.includes('Qualifications')) console.log('  ✅ "Qualifications" tab');
      if (pageText?.includes('Edit Profile')) console.log('  ❌ "Edit Profile" (old dialog)');
      
      console.log('✅ Test completed successfully!');
      
    } catch (error) {
      console.error('❌ Test failed:', error);
      await page.screenshot({ path: 'screenshots/debug-error.png', fullPage: true });
      throw error;
    }
  });
});
