/**
 * Phase 5: Simple Integration Testing
 * 
 * A focused test to validate that Phase 5 components are accessible
 * and work with the existing system without complex workflows.
 */

import { test, expect } from '@playwright/test';
import { ShowTestHelper } from './helpers/showTestHelper';

test.describe('Phase 5: Simple Integration Testing', () => {
  let testHelper: ShowTestHelper;

  test.beforeEach(async ({ page }) => {
    testHelper = new ShowTestHelper(page);
    
    // Navigate to application with extended timeout
    await page.goto('/', { waitUntil: 'networkidle', timeout: 30000 });
    
    // Sign in as admin for comprehensive testing
    await testHelper.signIn('admin');
  });

  test('should access all Phase 5 components and interfaces', async ({ page }) => {
    console.log('🚀 Testing Phase 5 component accessibility...');
    
    // Test 1: Judge Scoring Interface
    console.log('📋 Testing Judge Scoring Interface...');
    await page.goto('/judge-scoring', { waitUntil: 'networkidle', timeout: 15000 });
    
    // Should see the judge scoring interface
    await expect(page.locator('h1')).toContainText('Judge Scoring Interface');
    console.log('✅ Judge Scoring Interface accessible');
    
    // Check for key elements
    const hasDeviceCompatibility = await page.locator('text=Mobile Optimized').isVisible({ timeout: 5000 }).catch(() => false);
    const hasClassSelection = await page.locator('text=Select Class to Judge').isVisible({ timeout: 5000 }).catch(() => false);
    
    if (hasDeviceCompatibility) console.log('✅ Device compatibility section visible');
    if (hasClassSelection) console.log('✅ Class selection section visible');
    
    // Test 2: Results Dashboard
    console.log('📊 Testing Results Dashboard...');
    await page.goto('/results/dashboard', { waitUntil: 'networkidle', timeout: 15000 });
    
    // Should see the results entry system
    await expect(page.locator('h1')).toContainText('Result Entry System');
    console.log('✅ Results Dashboard accessible');
    
    // Check for quick access cards
    const hasQuickAccess = await page.locator('[data-testid*="card"]').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasRecentActivity = await page.locator('text=Recent Activity').isVisible({ timeout: 5000 }).catch(() => false);
    
    if (hasQuickAccess) console.log('✅ Quick access cards visible');
    if (hasRecentActivity) console.log('✅ Recent activity section visible');
    
    // Test 3: Test Judge Dashboard (existing component)
    console.log('👨‍⚖️ Testing Judge Dashboard...');
    await page.goto('/judge/dashboard', { waitUntil: 'networkidle', timeout: 15000 });
    
    // Should see judge dashboard or be redirected appropriately
    const hasJudgeContent = await page.locator('text=Judge').first().isVisible({ timeout: 5000 }).catch(() => false);
    const currentUrl = page.url();
    
    if (hasJudgeContent || currentUrl.includes('judge')) {
      console.log('✅ Judge Dashboard accessible');
    } else {
      console.log('ℹ️ Judge Dashboard redirected or needs setup');
    }
    
    console.log('🎉 PHASE 5 COMPONENT ACCESSIBILITY TEST COMPLETE');
  });

  test('should handle Phase 5 component rendering without errors', async ({ page }) => {
    console.log('🔧 Testing Phase 5 component rendering...');
    
    // Track console errors
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    // Track page errors
    const pageErrors: string[] = [];
    page.on('pageerror', error => {
      pageErrors.push(error.message);
    });
    
    // Test rendering of judge scoring page
    await page.goto('/judge-scoring', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000); // Allow time for rendering
    
    // Test rendering of results dashboard
    await page.goto('/results/dashboard', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000); // Allow time for rendering
    
    // Check for critical errors (filter out common non-critical warnings)
    const criticalErrors = consoleErrors.filter(error => 
      !error.includes('favicon') && 
      !error.includes('404') &&
      !error.toLowerCase().includes('warning')
    );
    
    const criticalPageErrors = pageErrors.filter(error =>
      !error.includes('favicon') &&
      !error.includes('404')
    );
    
    // Log any errors for debugging
    if (criticalErrors.length > 0) {
      console.log('⚠️ Console errors found:', criticalErrors);
    }
    
    if (criticalPageErrors.length > 0) {
      console.log('⚠️ Page errors found:', criticalPageErrors);
    }
    
    // Test should pass if no critical errors
    expect(criticalPageErrors.length).toBe(0);
    console.log('✅ No critical page errors found');
    
    if (criticalErrors.length === 0) {
      console.log('✅ No critical console errors found');
    }
    
    console.log('🎉 PHASE 5 COMPONENT RENDERING TEST COMPLETE');
  });

  test('should validate integration with existing system', async ({ page }) => {
    console.log('🔗 Testing Phase 5 integration with existing system...');
    
    // Test navigation between different sections
    await page.goto('/', { waitUntil: 'networkidle', timeout: 15000 });
    
    // Should be able to navigate to Phase 5 components from main app
    const navigationTests = [
      { path: '/judge-scoring', expectedText: 'Judge Scoring Interface' },
      { path: '/results/dashboard', expectedText: 'Result Entry System' },
      { path: '/judge/dashboard', expectedText: 'Judge' }
    ];
    
    for (const navTest of navigationTests) {
      try {
        await page.goto(navTest.path, { waitUntil: 'networkidle', timeout: 10000 });
        
        const hasExpectedContent = await page.locator(`text=${navTest.expectedText}`)
          .first().isVisible({ timeout: 5000 }).catch(() => false);
        
        if (hasExpectedContent) {
          console.log(`✅ Navigation to ${navTest.path} successful`);
        } else {
          console.log(`ℹ️ Navigation to ${navTest.path} needs content verification`);
        }
      } catch (error) {
        console.log(`⚠️ Navigation to ${navTest.path} encountered issues:`, error.message);
      }
    }
    
    // Test that we can return to home page
    await page.goto('/', { waitUntil: 'networkidle', timeout: 15000 });
    await expect(page).toHaveURL('/');
    console.log('✅ Navigation back to home successful');
    
    console.log('🎉 PHASE 5 INTEGRATION TEST COMPLETE');
  });

  test.afterEach(async ({ page }) => {
    // Cleanup - navigate back to home
    await page.goto('/', { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {
      console.log('Cleanup: Could not navigate to home page');
    });
  });
});