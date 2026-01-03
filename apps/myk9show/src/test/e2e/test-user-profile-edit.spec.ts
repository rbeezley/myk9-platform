import { test } from '@playwright/test';
import { TestSetup } from './helpers/testSetup';

test.describe('User Profile Edit Tests', () => {
  test('should display UserEditPanel when editing own profile', async ({ page }) => {
    const testSetup = new TestSetup(page);
    
    try {
      // Sign in as admin user
      console.log('🔐 Signing in as admin...');
      await testSetup.signIn('admin');
      
      // Take screenshot after login
      await page.screenshot({ path: 'screenshots/debug-profile-after-login.png', fullPage: true });
      console.log('📸 Screenshot saved: debug-profile-after-login.png');
      
      // Wait for the page to fully load
      await page.waitForLoadState('networkidle');
      
      // Look for user avatar/profile dropdown in the header
      console.log('👤 Looking for user profile access...');
      
      const profileSelectors = [
        '[data-testid="user-avatar"]',
        '[data-testid="profile-dropdown"]',
        '.user-avatar',
        'button:has([class*="avatar"])',
        'button:has-text("W")', // The "W" avatar we saw in the screenshot
        '[class*="avatar"]',
        'header button:last-child' // Often the profile button is the last in header
      ];
      
      let profileFound = false;
      for (const selector of profileSelectors) {
        const profileButton = page.locator(selector);
        if (await profileButton.count() > 0) {
          console.log(`✅ Found profile button: ${selector}`);
          await profileButton.first().click();
          await page.waitForTimeout(500); // Wait for dropdown
          profileFound = true;
          break;
        }
      }
      
      // Take screenshot after clicking profile
      await page.screenshot({ path: 'screenshots/debug-profile-dropdown.png', fullPage: true });
      console.log('📸 Screenshot saved: debug-profile-dropdown.png');
      
      if (profileFound) {
        // Look for profile-related options
        const profileOptions = [
          'text="Edit Profile"',
          'text="Profile"',
          'text="Account"',
          'text="Settings"',
          'a[href*="profile"]',
          'a[href*="account"]'
        ];
        
        let optionClicked = false;
        for (const option of profileOptions) {
          const optionElement = page.locator(option);
          if (await optionElement.count() > 0) {
            console.log(`✅ Found profile option: ${option}`);
            await optionElement.first().click();
            await page.waitForLoadState('networkidle');
            optionClicked = true;
            break;
          }
        }
        
        if (optionClicked) {
          // Take screenshot of profile page
          await page.screenshot({ path: 'screenshots/debug-profile-page.png', fullPage: true });
          console.log('📸 Screenshot saved: debug-profile-page.png');
          
          // Now look for edit button on the profile page
          console.log('✏️ Looking for edit button on profile page...');
          
          const editSelectors = [
            'button:has-text("Edit")',
            'button:has-text("Edit Profile")',
            'button:has-text("Edit User")',
            '[data-testid="edit-button"]',
            'button:has([class*="edit"])',
            'button[aria-label*="edit"]',
            '.apple-people-actions button', // From UserDetailsMain component
            'button:has(.lucide-more-vertical)' // Dropdown trigger
          ];
          
          let editOpened = false;
          for (const selector of editSelectors) {
            const editButton = page.locator(selector);
            if (await editButton.count() > 0) {
              console.log(`✅ Found edit button: ${selector}`);
              await editButton.first().click();
              await page.waitForTimeout(1000); // Wait for edit panel
              editOpened = true;
              break;
            }
          }
          
          // If no direct edit button, look for dropdown with edit option
          if (!editOpened) {
            const dropdownTriggers = [
              'button:has(.lucide-more-vertical)',
              'button:has-text("⋮")',
              '[data-testid="dropdown-trigger"]',
              '.apple-people-actions button'
            ];
            
            for (const selector of dropdownTriggers) {
              const trigger = page.locator(selector);
              if (await trigger.count() > 0) {
                console.log(`✅ Found dropdown trigger: ${selector}`);
                await trigger.first().click();
                await page.waitForTimeout(500);
                
                const editOption = page.locator('text="Edit User"');
                if (await editOption.count() > 0) {
                  console.log('✅ Found "Edit User" in dropdown');
                  await editOption.click();
                  await page.waitForTimeout(1000);
                  editOpened = true;
                  break;
                }
              }
            }
          }
          
          if (editOpened) {
            // Take screenshot of edit panel
            await page.screenshot({ path: 'screenshots/debug-edit-panel-open.png', fullPage: true });
            console.log('📸 Screenshot saved: debug-edit-panel-open.png');
            
            // Check for UserEditPanel elements
            console.log('🔍 Checking UserEditPanel elements...');
            
            const panelChecks = {
              editTitle: await page.locator('text="Edit User"').count(),
              editingSubtitle: await page.locator('text*="Editing profile for"').count(),
              basicInfoTab: await page.locator('text="Basic Info"').count(),
              contactTab: await page.locator('text="Contact"').count(),
              qualificationsTab: await page.locator('text="Qualifications"').count(),
              tabsContainer: await page.locator('[role="tablist"]').count(),
              oldEditProfile: await page.locator('text="Edit Profile"').count()
            };
            
            console.log('📋 UserEditPanel Elements:');
            Object.entries(panelChecks).forEach(([key, count]) => {
              console.log(`  ${count > 0 ? '✅' : '❌'} ${key}: ${count}`);
            });
            
            // Check for Apple design elements
            const designChecks = {
              appleClasses: await page.locator('[class*="apple-"]').count(),
              gradientElements: await page.locator('[class*="gradient"], [style*="gradient"]').count(),
              solidBackgrounds: await page.locator('[class*="bg-"]').count()
            };
            
            console.log('🎨 Apple Design Elements:');
            Object.entries(designChecks).forEach(([key, count]) => {
              console.log(`  ${count > 0 ? '✅' : '❌'} ${key}: ${count}`);
            });
            
            // Get page content to verify
            const pageContent = await page.textContent('body');
            const contentChecks = {
              hasEditUser: pageContent?.includes('Edit User') || false,
              hasBasicInfo: pageContent?.includes('Basic Info') || false,
              hasContact: pageContent?.includes('Contact') || false,
              hasQualifications: pageContent?.includes('Qualifications') || false,
              hasOldEditProfile: pageContent?.includes('Edit Profile') || false
            };
            
            console.log('📄 Page Content Check:');
            Object.entries(contentChecks).forEach(([key, found]) => {
              console.log(`  ${found ? '✅' : '❌'} ${key}: ${found}`);
            });
            
            if (contentChecks.hasOldEditProfile && !contentChecks.hasEditUser) {
              console.log('⚠️ WARNING: Still showing old "Edit Profile" dialog instead of new UserEditPanel!');
            } else if (contentChecks.hasEditUser && contentChecks.hasBasicInfo) {
              console.log('🎉 SUCCESS: UserEditPanel is displaying correctly!');
            }
            
          } else {
            console.log('❌ Could not find edit button or option');
          }
        }
      } else {
        console.log('❌ Could not find user profile access');
        
        // Try alternative: navigate directly to profile page if we know the user ID
        console.log('🔄 Trying alternative approach...');
        
        // Try common profile routes
        const profileRoutes = ['/profile', '/account', '/user/profile'];
        
        for (const route of profileRoutes) {
          try {
            await page.goto(`http://127.0.0.1:5174${route}`);
            await page.waitForLoadState('networkidle');
            
            // Check if we successfully navigated to a profile page
            const content = await page.textContent('body');
            if (content && !content.includes('Sign in to your account')) {
              console.log(`✅ Successfully navigated to: ${route}`);
              await page.screenshot({ path: `screenshots/debug-${route.replace('/', '')}-page.png`, fullPage: true });
              break;
            }
          } catch {
            console.log(`❌ Failed to navigate to: ${route}`);
          }
        }
      }
      
      // Take final screenshot
      await page.screenshot({ path: 'screenshots/debug-final-state.png', fullPage: true });
      console.log('📸 Screenshot saved: debug-final-state.png');
      
      console.log('✅ Profile edit test completed!');
      
    } catch (error) {
      console.error('❌ Test failed:', error);
      await page.screenshot({ path: 'screenshots/debug-error.png', fullPage: true });
      throw error;
    }
  });
});
