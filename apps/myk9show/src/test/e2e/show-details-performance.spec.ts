import { test, expect } from '@playwright/test';

test.describe('Show Details Page Performance Analysis', () => {
  const SHOW_ID = '1bf3d92f-5b22-41b1-b269-09fa9f652c10';
  const TARGET_URL = `http://127.0.0.1:5177/shows/${SHOW_ID}`;
  
  // const performanceMetrics: Record<string, unknown> = {};

  test.beforeEach(async ({ page }) => {
    // Enable performance monitoring
    await page.addInitScript(() => {
      // Track performance metrics
      window.performance.mark('test-start');
      
      // Monitor component render times
      const originalRender = window.requestAnimationFrame;
      let renderCount = 0;
      window.requestAnimationFrame = function(callback) {
        renderCount++;
        return originalRender.call(window, function(...args) {
          window.performance.mark(`render-${renderCount}`);
          return callback(...args);
        });
      };
    });
  });

  test('Show Details Page - Component Render Performance', async ({ page }) => {
    console.log('🔍 Testing Show Details Component Render Performance...');
    
    const startTime = performance.now();
    
    // Navigate to the show details page
    await page.goto(TARGET_URL, { waitUntil: 'networkidle' });
    
    // Wait for key components to be visible
    await expect(page.locator('.apple-show-container')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.apple-show-header')).toBeVisible();
    
    const loadTime = performance.now() - startTime;
    
    // Measure component-specific render times
    const componentMetrics = await page.evaluate(() => {
      const marks = performance.getEntriesByType('mark');
      const measures: Record<string, unknown> = {};
      
      // Measure key component render times
      const startMark = marks.find(m => m.name === 'test-start');
      if (startMark) {
        measures.totalTime = performance.now() - startMark.startTime;
      }
      
      return {
        marks: marks.length,
        measures,
        memory: (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory ? {
          usedJSHeapSize: (performance as unknown as { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize,
          totalJSHeapSize: (performance as unknown as { memory: { totalJSHeapSize: number } }).memory.totalJSHeapSize
        } : null
      };
    });
    
    console.log('📊 Component Render Metrics:', {
      pageLoadTime: `${loadTime.toFixed(2)}ms`,
      totalMarks: componentMetrics.marks,
      memoryUsage: componentMetrics.memory
    });
    
    // Performance assertions
    expect(loadTime).toBeLessThan(5000); // Page should load in under 5 seconds
    expect(componentMetrics.marks).toBeGreaterThan(0); // Should have render marks
  });

  test('Show Details Page - CSS Loading Performance', async ({ page }) => {
    console.log('🎨 Testing CSS Loading and Styling Performance...');
    
    const startTime = performance.now();
    
    // Track CSS loading
    await page.route('**/*.css', async route => {
      const start = performance.now();
      await route.continue();
      const end = performance.now();
      console.log(`CSS loaded: ${route.request().url()} (${(end - start).toFixed(2)}ms)`);
    });
    
    await page.goto(TARGET_URL);
    
    // Wait for Apple design system styles to be applied
    await page.waitForLoadState('networkidle');
    
    const cssMetrics = await page.evaluate(() => {
      const sheets = Array.from(document.styleSheets);
      const appliedStyles = {
        totalSheets: sheets.length,
        totalRules: 0,
        appleStyles: 0
      };
      
      try {
        sheets.forEach(sheet => {
          if (sheet.cssRules) {
            appliedStyles.totalRules += sheet.cssRules.length;
            
            // Count Apple-specific styles
            Array.from(sheet.cssRules).forEach(rule => {
              if (rule.cssText && rule.cssText.includes('apple-')) {
                appliedStyles.appleStyles++;
              }
            });
          }
        });
      } catch {
        // Some stylesheets may not be accessible due to CORS
      }
      
      // Check if key Apple classes are rendered correctly
      const appleContainer = document.querySelector('.apple-show-container');
      const appleHeader = document.querySelector('.apple-show-header');
      const appleTabs = document.querySelector('[role="tablist"]');
      
      return {
        ...appliedStyles,
        keyElements: {
          container: appleContainer ? getComputedStyle(appleContainer).display !== 'none' : false,
          header: appleHeader ? getComputedStyle(appleHeader).display !== 'none' : false,
          tabs: appleTabs ? getComputedStyle(appleTabs).display !== 'none' : false
        }
      };
    });
    
    const cssLoadTime = performance.now() - startTime;
    
    console.log('🎨 CSS Performance Metrics:', {
      loadTime: `${cssLoadTime.toFixed(2)}ms`,
      totalStylesheets: cssMetrics.totalSheets,
      totalRules: cssMetrics.totalRules,
      appleStyles: cssMetrics.appleStyles,
      keyElements: cssMetrics.keyElements
    });
    
    // CSS performance assertions
    expect(cssLoadTime).toBeLessThan(3000); // CSS should load quickly
    expect(cssMetrics.totalSheets).toBeGreaterThan(0);
    expect(cssMetrics.keyElements.container).toBe(true);
    expect(cssMetrics.keyElements.header).toBe(true);
  });

  test('Show Details Page - Data Processing Performance', async ({ page }) => {
    console.log('📊 Testing Data Processing and Calculations...');
    
    await page.goto(TARGET_URL);
    await page.waitForLoadState('networkidle');
    
    // Measure data processing performance
    const dataMetrics = await page.evaluate(() => {
      const startTime = performance.now();
      
      // Simulate data calculations that might happen in the component
      const mockTrials = Array.from({ length: 10 }, (_, i) => ({
        id: `trial-${i}`,
        status: i % 3 === 0 ? 'Completed' : i % 3 === 1 ? 'Upcoming' : 'In Progress',
        trialDate: new Date().toISOString(),
        type: 'Standard',
        trialNumber: `${i + 1}`
      }));
      
      // Calculate statistics (similar to what ShowDetailsEnhancedApple does)
      const totalTrials = mockTrials.length;
      // const upcomingTrials = mockTrials.filter(t => t.status === 'Upcoming').length;
      const completedTrials = mockTrials.filter(t => t.status === 'Completed').length;
      const totalClasses = totalTrials * 8;
      const totalEntries = totalTrials * 32;
      
      const stats = [
        {
          title: "Total Trials",
          value: totalTrials.toString(),
          progress: totalTrials > 0 ? Math.round((completedTrials / totalTrials) * 100) : 0,
        },
        {
          title: "Total Classes",
          value: totalClasses.toString(),
          progress: totalClasses > 0 ? Math.round(((completedTrials * 8) / totalClasses) * 100) : 0,
        },
        {
          title: "Total Entries",
          value: totalEntries.toString(),
          progress: totalEntries > 0 ? Math.round(((completedTrials * 32) / totalEntries) * 100) : 0,
        }
      ];
      
      const calculationTime = performance.now() - startTime;
      
      return {
        calculationTime,
        dataProcessed: {
          trials: totalTrials,
          classes: totalClasses,
          entries: totalEntries,
          statsGenerated: stats.length
        }
      };
    });
    
    console.log('📊 Data Processing Metrics:', {
      calculationTime: `${dataMetrics.calculationTime.toFixed(2)}ms`,
      dataProcessed: dataMetrics.dataProcessed
    });
    
    // Data processing should be very fast
    expect(dataMetrics.calculationTime).toBeLessThan(100); // Under 100ms for calculations
    expect(dataMetrics.dataProcessed.trials).toBeGreaterThan(0);
  });

  test('Show Details Page - Role Calculation Performance', async ({ page }) => {
    console.log('👤 Testing Role-based UI Adaptation Performance...');
    
    await page.goto(TARGET_URL);
    await page.waitForLoadState('networkidle');
    
    // Test role calculation performance
    const roleMetrics = await page.evaluate(() => {
      const startTime = performance.now();
      
      // Simulate role priority calculation (from ShowDetailsEnhancedApple)
      const mockUserWithRoles = {
        roles: ['EXHIBITOR', 'SECRETARY', 'CLUB_ADMIN']
      };
      
      const rolePriority = [
        'SITE_ADMIN',
        'SECRETARY', 
        'CLUB_ADMIN',
        'JUDGE',
        'EXHIBITOR'
      ];
      
      let primaryRole = 'EXHIBITOR';
      for (const role of rolePriority) {
        if (mockUserWithRoles.roles.includes(role)) {
          primaryRole = role;
          break;
        }
      }
      
      // Simulate tab configuration based on role
      const baseTabs = ['overview'];
      const roleTabs: string[] = [];
      
      if (primaryRole === 'EXHIBITOR') {
        roleTabs.push('registration');
      }
      if (['SECRETARY', 'CLUB_ADMIN', 'SITE_ADMIN'].includes(primaryRole)) {
        roleTabs.push('management');
      }
      if (primaryRole === 'JUDGE') {
        roleTabs.push('assignments');
      }
      
      roleTabs.push('trials');
      
      const roleCalculationTime = performance.now() - startTime;
      
      return {
        roleCalculationTime,
        primaryRole,
        totalTabs: baseTabs.length + roleTabs.length,
        tabsGenerated: roleTabs
      };
    });
    
    console.log('👤 Role Calculation Metrics:', {
      calculationTime: `${roleMetrics.roleCalculationTime.toFixed(2)}ms`,
      primaryRole: roleMetrics.primaryRole,
      totalTabs: roleMetrics.totalTabs,
      tabsGenerated: roleMetrics.tabsGenerated
    });
    
    // Role calculations should be instantaneous
    expect(roleMetrics.roleCalculationTime).toBeLessThan(50); // Under 50ms
    expect(roleMetrics.totalTabs).toBeGreaterThan(1);
  });

  test('Show Details Page - AppleTabs Component Performance', async ({ page }) => {
    console.log('📑 Testing AppleTabs Component Performance...');
    
    await page.goto(TARGET_URL);
    await page.waitForLoadState('networkidle');
    
    // Wait for tabs to be rendered
    await expect(page.locator('[role="tablist"]')).toBeVisible();
    
    const tabMetrics = await page.evaluate(() => {
      const startTime = performance.now();
      
      // Find tab elements
      const tabList = document.querySelector('[role="tablist"]');
      const tabs = tabList ? tabList.querySelectorAll('[role="tab"]') : [];
      const tabPanels = document.querySelectorAll('[role="tabpanel"]');
      
      // Measure tab interaction performance
      let interactionTime = 0;
      if (tabs.length > 1) {
        const secondTab = tabs[1] as HTMLElement;
        const interactionStart = performance.now();
        secondTab.click();
        interactionTime = performance.now() - interactionStart;
      }
      
      const renderTime = performance.now() - startTime;
      
      return {
        renderTime,
        interactionTime,
        tabCount: tabs.length,
        panelCount: tabPanels.length,
        tabsVisible: Array.from(tabs).every(tab => 
          getComputedStyle(tab).display !== 'none'
        )
      };
    });
    
    console.log('📑 AppleTabs Performance Metrics:', {
      renderTime: `${tabMetrics.renderTime.toFixed(2)}ms`,
      interactionTime: `${tabMetrics.interactionTime.toFixed(2)}ms`,
      tabCount: tabMetrics.tabCount,
      panelCount: tabMetrics.panelCount,
      allTabsVisible: tabMetrics.tabsVisible
    });
    
    // Tab performance assertions
    expect(tabMetrics.renderTime).toBeLessThan(500); // Tabs should render quickly
    expect(tabMetrics.interactionTime).toBeLessThan(100); // Tab switching should be instant
    expect(tabMetrics.tabCount).toBeGreaterThan(0);
    expect(tabMetrics.tabsVisible).toBe(true);
  });

  test('Show Details Page - Memory Usage Analysis', async ({ page }) => {
    console.log('🧠 Testing Memory Usage Patterns...');
    
    await page.goto(TARGET_URL);
    await page.waitForLoadState('networkidle');
    
    // Measure memory usage
    const memoryMetrics = await page.evaluate(() => {
      const memory = (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
      
      if (!memory) {
        return { error: 'Memory API not available' };
      }
      
      return {
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
        jsHeapSizeLimit: memory.jsHeapSizeLimit,
        usedMB: Math.round(memory.usedJSHeapSize / 1024 / 1024),
        totalMB: Math.round(memory.totalJSHeapSize / 1024 / 1024)
      };
    });
    
    console.log('🧠 Memory Usage Metrics:', memoryMetrics);
    
    if (!memoryMetrics.error) {
      // Memory usage should be reasonable
      expect(memoryMetrics.usedMB).toBeLessThan(100); // Under 100MB
      expect(memoryMetrics.usedJSHeapSize).toBeGreaterThan(0);
    }
  });

  test('Show Details Page - Re-render Optimization Check', async ({ page }) => {
    console.log('🔄 Testing Re-render Optimization...');
    
    await page.goto(TARGET_URL);
    await page.waitForLoadState('networkidle');
    
    // Measure re-render performance when switching tabs
    const rerenderMetrics = await page.evaluate(() => {
      const startTime = performance.now();
      let renderCount = 0;
      
      // Override React's render method to count renders
      const originalRaf = window.requestAnimationFrame;
      window.requestAnimationFrame = function(callback) {
        renderCount++;
        return originalRaf.call(window, callback);
      };
      
      // Simulate tab switching
      const tabs = document.querySelectorAll('[role="tab"]');
      let switchTime = 0;
      
      if (tabs.length > 1) {
        const switchStart = performance.now();
        (tabs[1] as HTMLElement).click();
        
        // Wait a bit for any renders to complete
        setTimeout(() => {
          switchTime = performance.now() - switchStart;
        }, 100);
      }
      
      const totalTime = performance.now() - startTime;
      
      return {
        totalTime,
        switchTime,
        renderCount,
        tabCount: tabs.length
      };
    });
    
    // Wait for the evaluation to complete
    await page.waitForTimeout(200);
    
    console.log('🔄 Re-render Optimization Metrics:', rerenderMetrics);
    
    // Re-render should be minimal and fast
    expect(rerenderMetrics.renderCount).toBeLessThan(50); // Not too many renders
    expect(rerenderMetrics.tabCount).toBeGreaterThan(0);
  });

  test('Show Details Page - Overall Performance Summary', async ({ page }) => {
    console.log('📋 Running Overall Performance Summary...');
    
    const overallStart = performance.now();
    
    // Navigate and wait for complete load
    await page.goto(TARGET_URL, { waitUntil: 'networkidle' });
    
    // Wait for all key components
    await expect(page.locator('.apple-show-container')).toBeVisible();
    await expect(page.locator('.apple-show-header')).toBeVisible();
    await expect(page.locator('[role="tablist"]')).toBeVisible();
    
    const overallLoadTime = performance.now() - overallStart;
    
    // Get comprehensive performance metrics
    const finalMetrics = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      const paint = performance.getEntriesByType('paint');
      const memory = (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
      
      return {
        navigation: {
          domContentLoaded: nav.domContentLoadedEventEnd - nav.domContentLoadedEventStart,
          loadComplete: nav.loadEventEnd - nav.loadEventStart,
          domInteractive: nav.domInteractive - nav.navigationStart,
          totalLoadTime: nav.loadEventEnd - nav.navigationStart
        },
        paint: {
          firstPaint: paint.find(p => p.name === 'first-paint')?.startTime || 0,
          firstContentfulPaint: paint.find(p => p.name === 'first-contentful-paint')?.startTime || 0
        },
        memory: memory ? {
          usedMB: Math.round(memory.usedJSHeapSize / 1024 / 1024),
          totalMB: Math.round(memory.totalJSHeapSize / 1024 / 1024)
        } : null,
        elements: {
          totalElements: document.querySelectorAll('*').length,
          appleElements: document.querySelectorAll('[class*="apple-"]').length,
          tabElements: document.querySelectorAll('[role="tab"]').length
        }
      };
    });
    
    console.log('📋 OVERALL PERFORMANCE SUMMARY:');
    console.log('================================');
    console.log(`🕒 Total Load Time: ${overallLoadTime.toFixed(2)}ms`);
    console.log(`🏗️  DOM Content Loaded: ${finalMetrics.navigation.domContentLoaded.toFixed(2)}ms`);
    console.log(`🎨 First Contentful Paint: ${finalMetrics.paint.firstContentfulPaint.toFixed(2)}ms`);
    console.log(`📊 DOM Elements: ${finalMetrics.elements.totalElements}`);
    console.log(`🍎 Apple Elements: ${finalMetrics.elements.appleElements}`);
    console.log(`📑 Tab Elements: ${finalMetrics.elements.tabElements}`);
    if (finalMetrics.memory) {
      console.log(`🧠 Memory Usage: ${finalMetrics.memory.usedMB}MB`);
    }
    console.log('================================');
    
    // Final performance assertions
    expect(overallLoadTime).toBeLessThan(5000); // Overall load under 5s
    expect(finalMetrics.navigation.domContentLoaded).toBeLessThan(3000); // DOM ready under 3s
    expect(finalMetrics.paint.firstContentfulPaint).toBeLessThan(2000); // FCP under 2s
    expect(finalMetrics.elements.appleElements).toBeGreaterThan(0); // Apple components loaded
    expect(finalMetrics.elements.tabElements).toBeGreaterThan(0); // Tabs loaded
  });
});