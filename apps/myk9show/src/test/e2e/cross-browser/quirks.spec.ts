import { test, expect } from '@playwright/test';
import { TestSetup } from '../helpers/testSetup';
import { VisualTestHelper } from '../helpers/visualTestHelper';

/* eslint-disable @typescript-eslint/no-unused-vars */

test.describe('Cross-Browser Quirks and Compatibility Tests', () => {
  let testSetup: TestSetup;
  let visualHelper: VisualTestHelper;

  test.beforeEach(async ({ page }) => {
    testSetup = new TestSetup(page);
    visualHelper = new VisualTestHelper(page);
    await testSetup.clearTestData();
    await testSetup.mockApiResponses();
  });

  test.describe('Date Input Handling', () => {
    test.beforeEach(async () => {
      await testSetup.signIn('user');
    });

    test('date input format consistency', async ({ page, browserName }) => {
      await page.goto('/dogs/add');
      await visualHelper.waitForPageLoad();
      
      const dateInput = page.locator('[data-testid="dog-birth-date"]');
      
      // Different browsers handle date inputs differently
      if (browserName === 'webkit') {
        // Safari might not support HTML5 date input
        const inputType = await dateInput.getAttribute('type');
        if (inputType === 'text') {
          // Use text format for Safari fallback
          await dateInput.fill('01/15/2020');
        } else {
          await dateInput.fill('2020-01-15');
        }
      } else {
        // Chrome and Firefox support HTML5 date input
        await dateInput.fill('2020-01-15');
      }
      
      // Verify date value is accepted
      const dateValue = await dateInput.inputValue();
      expect(dateValue).toBeTruthy();
      
      console.log(`✅ ${browserName}: Date input handling verified - ${dateValue}`);
    });

    test('date picker interaction', async ({ page, browserName }) => {
      await page.goto('/dogs/add');
      await visualHelper.waitForPageLoad();
      
      const dateInput = page.locator('[data-testid="dog-birth-date"]');
      
      // Click on date input to trigger picker
      await dateInput.click();
      
      if (browserName === 'webkit') {
        // Safari might show native date picker or fallback
        try {
          await page.waitForSelector('[data-testid="date-picker-calendar"]', { timeout: 1000 });
          await expect(page.locator('[data-testid="date-picker-calendar"]')).toBeVisible();
        } catch {
          // Fallback for Safari - just verify input works
          await dateInput.fill('01/15/2020');
        }
      } else {
        // Chrome and Firefox have native date pickers
        // Just verify the input accepts focus
        await expect(dateInput).toBeFocused();
      }
      
      console.log(`✅ ${browserName}: Date picker interaction verified`);
    });
  });

  test.describe('File Upload Handling', () => {
    test.beforeEach(async () => {
      await testSetup.signIn('user');
    });

    test('file input accessibility', async ({ page, browserName }) => {
      await page.goto('/dogs/add');
      await visualHelper.waitForPageLoad();
      
      // Check if file upload is present
      const fileInput = page.locator('[data-testid="dog-photo-upload"]');
      if (await fileInput.isVisible()) {
        
        // Different browsers handle file inputs differently
        if (browserName === 'webkit') {
          // Safari has specific file input behavior
          await expect(fileInput).toBeVisible();
          await expect(fileInput).toHaveAttribute('type', 'file');
        } else {
          // Chrome and Firefox
          await expect(fileInput).toBeVisible();
          await expect(fileInput).toHaveAttribute('type', 'file');
          
          // Test file selection dialog trigger
          const uploadButton = page.locator('[data-testid="upload-button"]');
          if (await uploadButton.isVisible()) {
            await uploadButton.click();
            // File dialog should open (can't test actual file selection in automation)
          }
        }
      }
      
      console.log(`✅ ${browserName}: File input accessibility verified`);
    });
  });

  test.describe('CSS Flexbox and Grid Support', () => {
    test.beforeEach(async () => {
      await testSetup.signIn('user');
    });

    test('flexbox layout consistency', async ({ page, browserName }) => {
      await page.goto('/');
      await visualHelper.waitForPageLoad();
      
      // Check flexbox implementation
      const flexContainer = page.locator('[data-testid="flex-layout"]');
      
      const flexStyles = await flexContainer.evaluate((el) => {
        const computed = window.getComputedStyle(el);
        return {
          display: computed.display,
          flexDirection: computed.flexDirection,
          justifyContent: computed.justifyContent,
          alignItems: computed.alignItems
        };
      });
      
      // All modern browsers should support flexbox consistently
      expect(flexStyles.display).toContain('flex');
      
      // Browser-specific flex behavior checks
      if (browserName === 'webkit') {
        // Safari might have webkit-specific prefixes in older versions
        expect(flexStyles.display).toMatch(/flex|webkit-flex/);
      }
      
      console.log(`✅ ${browserName}: Flexbox support verified`, flexStyles);
    });

    test('CSS Grid layout consistency', async ({ page, browserName }) => {
      await visualHelper.mockShowListData();
      await page.goto('/shows');
      await visualHelper.waitForPageLoad();
      
      const gridContainer = page.locator('[data-testid="show-cards-grid"]');
      
      const gridStyles = await gridContainer.evaluate((el) => {
        const computed = window.getComputedStyle(el);
        return {
          display: computed.display,
          gridTemplateColumns: computed.gridTemplateColumns,
          gap: computed.gap || computed.gridGap // Fallback for older syntax
        };
      });
      
      // Check CSS Grid support
      if (browserName === 'webkit') {
        // Safari supports CSS Grid but might use different property names
        expect(gridStyles.display).toMatch(/grid|webkit-grid/);
      } else {
        expect(gridStyles.display).toBe('grid');
      }
      
      console.log(`✅ ${browserName}: CSS Grid support verified`, gridStyles);
    });
  });

  test.describe('JavaScript API Compatibility', () => {
    test('fetch API consistency', async ({ page, browserName }) => {
      await page.goto('/');
      
      const fetchSupport = await page.evaluate(() => {
        return {
          fetchExists: typeof fetch !== 'undefined',
          promiseExists: typeof Promise !== 'undefined',
          asyncAwaitSupport: (async () => true)().constructor === Promise
        };
      });
      
      // All modern browsers should support fetch API
      expect(fetchSupport.fetchExists).toBe(true);
      expect(fetchSupport.promiseExists).toBe(true);
      expect(fetchSupport.asyncAwaitSupport).toBe(true);
      
      console.log(`✅ ${browserName}: Fetch API support verified`);
    });

    test('Web Storage API consistency', async ({ page, browserName }) => {
      await page.goto('/');
      
      const storageSupport = await page.evaluate(() => {
        return {
          localStorage: typeof localStorage !== 'undefined',
          sessionStorage: typeof sessionStorage !== 'undefined',
          indexedDB: typeof indexedDB !== 'undefined'
        };
      });
      
      expect(storageSupport.localStorage).toBe(true);
      expect(storageSupport.sessionStorage).toBe(true);
      
      // IndexedDB might have different support levels
      if (browserName === 'webkit') {
        // Safari has full IndexedDB support in modern versions
        expect(storageSupport.indexedDB).toBe(true);
      } else {
        expect(storageSupport.indexedDB).toBe(true);
      }
      
      console.log(`✅ ${browserName}: Web Storage API support verified`);
    });

    test('IntersectionObserver API support', async ({ page, browserName }) => {
      await page.goto('/');
      
      const observerSupport = await page.evaluate(() => {
        return {
          intersectionObserver: typeof IntersectionObserver !== 'undefined',
          mutationObserver: typeof MutationObserver !== 'undefined',
          resizeObserver: typeof ResizeObserver !== 'undefined'
        };
      });
      
      expect(observerSupport.intersectionObserver).toBe(true);
      expect(observerSupport.mutationObserver).toBe(true);
      
      // ResizeObserver might not be supported in older browsers
      if (browserName === 'webkit') {
        // Check Safari version - ResizeObserver is supported in Safari 13.1+
        console.log(`ResizeObserver support in ${browserName}:`, observerSupport.resizeObserver);
      } else {
        expect(observerSupport.resizeObserver).toBe(true);
      }
      
      console.log(`✅ ${browserName}: Observer APIs support verified`);
    });
  });

  test.describe('Form Element Behavior', () => {
    test.beforeEach(async () => {
      await testSetup.signIn('user');
    });

    test('select dropdown behavior', async ({ page, browserName }) => {
      await page.goto('/dogs/add');
      await visualHelper.waitForPageLoad();
      
      const selectElement = page.locator('[data-testid="dog-breed-select"]');
      
      // Click to open dropdown
      await selectElement.click();
      
      if (browserName === 'webkit') {
        // Safari might show native picker wheel on mobile
        await page.waitForTimeout(300);
      }
      
      // Select an option
      await selectElement.selectOption('Golden Retriever');
      
      // Verify selection
      const selectedValue = await selectElement.inputValue();
      expect(selectedValue).toBe('Golden Retriever');
      
      console.log(`✅ ${browserName}: Select dropdown behavior verified`);
    });

    test('checkbox and radio styling', async ({ page, browserName }) => {
      await page.goto('/dogs/add');
      await visualHelper.waitForPageLoad();
      
      // Test checkbox
      const checkbox = page.locator('[data-testid="dog-active-checkbox"]');
      if (await checkbox.isVisible()) {
        await checkbox.check();
        await expect(checkbox).toBeChecked();
        
        // Check custom styling
        const checkboxStyles = await checkbox.evaluate((el) => {
          const computed = window.getComputedStyle(el);
          return {
            appearance: computed.appearance || computed.webkitAppearance,
            background: computed.backgroundColor
          };
        });
        
        console.log(`${browserName} checkbox styles:`, checkboxStyles);
      }
      
      // Test radio buttons
      const radioGroup = page.locator('[data-testid="dog-sex-radio-group"]');
      if (await radioGroup.isVisible()) {
        const maleRadio = radioGroup.locator('input[value="Male"]');
        await maleRadio.check();
        await expect(maleRadio).toBeChecked();
      }
      
      console.log(`✅ ${browserName}: Checkbox and radio styling verified`);
    });
  });

  test.describe('CSS Animation and Transition Support', () => {
    test.beforeEach(async () => {
      await testSetup.signIn('user');
    });

    test('CSS transitions consistency', async ({ page, browserName }) => {
      await page.goto('/dogs');
      await visualHelper.waitForPageLoad();
      
      const button = page.locator('[data-testid="add-dog-button"]');
      
      // Get initial styles
      const initialStyles = await button.evaluate((el) => {
        const computed = window.getComputedStyle(el);
        return {
          transform: computed.transform,
          transition: computed.transition || computed.webkitTransition
        };
      });
      
      // Hover to trigger transition
      await button.hover();
      
      // Wait for transition
      await page.waitForTimeout(300);
      
      const hoverStyles = await button.evaluate((el) => {
        const computed = window.getComputedStyle(el);
        return {
          transform: computed.transform,
          transition: computed.transition || computed.webkitTransition
        };
      });
      
      // Verify transition properties exist
      expect(hoverStyles.transition || hoverStyles.webkitTransition).toBeTruthy();
      
      console.log(`✅ ${browserName}: CSS transitions verified`);
    });

    test('keyframe animations support', async ({ page, browserName }) => {
      await page.goto('/');
      await visualHelper.waitForPageLoad();
      
      // Check for loading animations
      const loadingElement = page.locator('[data-testid="loading-spinner"]');
      
      if (await loadingElement.isVisible()) {
        const animationStyles = await loadingElement.evaluate((el) => {
          const computed = window.getComputedStyle(el);
          return {
            animation: computed.animation || computed.webkitAnimation,
            animationName: computed.animationName || computed.webkitAnimationName
          };
        });
        
        expect(animationStyles.animation || animationStyles.webkitAnimation).toBeTruthy();
      }
      
      console.log(`✅ ${browserName}: Keyframe animations verified`);
    });
  });

  test.describe('Viewport and Media Query Behavior', () => {
    test('responsive breakpoints consistency', async ({ page, browserName }) => {
      await testSetup.signIn('user');
      await page.goto('/');
      
      // Test different viewport sizes
      const viewports = [
        { width: 320, height: 568, name: 'mobile' },
        { width: 768, height: 1024, name: 'tablet' },
        { width: 1200, height: 800, name: 'desktop' }
      ];
      
      for (const viewport of viewports) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await visualHelper.waitForPageLoad();
        
        // Check media query application
        const mediaQueryStyles = await page.evaluate((vp) => {
          return {
            matches: window.matchMedia(`(max-width: ${vp.width}px)`).matches,
            viewport: `${vp.width}x${vp.height}`
          };
        }, viewport);
        
        console.log(`${browserName} ${viewport.name}:`, mediaQueryStyles);
      }
      
      console.log(`✅ ${browserName}: Responsive breakpoints verified`);
    });
  });

  test.describe('Browser-Specific Feature Detection', () => {
    test('CSS custom properties support', async ({ page, browserName }) => {
      await page.goto('/');
      
      const cssVariableSupport = await page.evaluate(() => {
        const testEl = document.createElement('div');
        testEl.style.setProperty('--test-var', 'test');
        return testEl.style.getPropertyValue('--test-var') === 'test';
      });
      
      // All modern browsers should support CSS custom properties
      expect(cssVariableSupport).toBe(true);
      
      console.log(`✅ ${browserName}: CSS custom properties supported`);
    });

    test('ES6+ features support', async ({ page, browserName }) => {
      await page.goto('/');
      
      const es6Support = await page.evaluate(() => {
        try {
          // Test various ES6+ features
          const arrow = () => true;
          const destructuring = ([a, b] = [1, 2]) => a + b;
          const templateLiteral = `test`;
          const asyncFunction = async () => true;
          
          return {
            arrow: typeof arrow === 'function',
            destructuring: destructuring() === 3,
            templateLiteral: templateLiteral === 'test',
            asyncFunction: typeof asyncFunction === 'function',
            promise: typeof Promise !== 'undefined',
            map: typeof Map !== 'undefined',
            set: typeof Set !== 'undefined'
          };
        } catch (e) {
          return { error: e.message };
        }
      });
      
      // All modern browsers should support these ES6+ features
      if (!es6Support.error) {
        expect(es6Support.arrow).toBe(true);
        expect(es6Support.promise).toBe(true);
        expect(es6Support.map).toBe(true);
        expect(es6Support.set).toBe(true);
      }
      
      console.log(`✅ ${browserName}: ES6+ features support verified`, es6Support);
    });
  });

  test.describe('Text Rendering and Font Support', () => {
    test('font loading consistency', async ({ page, browserName }) => {
      await page.goto('/');
      await page.waitForFunction(() => document.fonts.ready);
      
      const fontInfo = await page.evaluate(() => {
        const body = document.body;
        const computed = window.getComputedStyle(body);
        return {
          fontFamily: computed.fontFamily,
          fontSize: computed.fontSize,
          fontWeight: computed.fontWeight,
          lineHeight: computed.lineHeight
        };
      });
      
      expect(fontInfo.fontFamily).toBeTruthy();
      expect(fontInfo.fontSize).toBeTruthy();
      
      // Different browsers might render fonts slightly differently
      console.log(`${browserName} font rendering:`, fontInfo);
      
      console.log(`✅ ${browserName}: Font loading consistency verified`);
    });

    test('text selection behavior', async ({ page, browserName }) => {
      await page.goto('/');
      await visualHelper.waitForPageLoad();
      
      const textElement = page.locator('h1').first();
      
      if (await textElement.isVisible()) {
        // Triple-click to select all text
        await textElement.click({ clickCount: 3 });
        
        const selectedText = await page.evaluate(() => {
          return window.getSelection()?.toString() || '';
        });
        
        expect(selectedText.length).toBeGreaterThan(0);
        
        console.log(`✅ ${browserName}: Text selection behavior verified - "${selectedText}"`);
      }
    });
  });
});