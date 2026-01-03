import { test } from '@playwright/test';

test.describe('Component-Level Search Bar Test', () => {
  const viewports = [
    { name: 'mobile', width: 375, height: 667 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1200, height: 800 },
    { name: 'wide-desktop', width: 1400, height: 900 }
  ];

  // Create a standalone HTML page with the search component
  const createTestPage = (width: number, height: number) => `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Search Bar Test</title>
        <style>
            /* CSS Variables - from EntryList.css */
            :root {
                --background: #ffffff;
                --foreground: #000000;
                --card: #ffffff;
                --card-foreground: #000000;
                --muted: #f8f9fa;
                --muted-foreground: #495057;
                --border: #dee2e6;
                --input: #f1f3f4;
                --primary: #0066cc;
                --primary-foreground: #ffffff;
                --secondary: #e9ecef;
                --secondary-foreground: #212529;
                --text-primary: #000000;
                --text-secondary: #2d3748;
                --text-tertiary: #4a5568;
                --brand-blue: #007AFF;
                --brand-purple: #5856D6;
                --success: #34C759;
                --warning: #FF9500;
                --error: #FF3B30;
            }

            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }

            body {
                font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif;
                background: var(--background);
                color: var(--foreground);
                width: ${width}px;
                height: ${height}px;
                overflow-x: hidden;
            }

            /* Entry List Header */
            .entry-list-header {
                display: flex;
                align-items: center;
                justify-content: flex-start;
                gap: 1rem;
                padding: 1.5rem;
                background: var(--card);
                border-bottom: 1px solid var(--border);
            }

            .hamburger-menu {
                background: var(--secondary);
                border: 1px solid var(--border);
                border-radius: 0.75rem;
                padding: 0.75rem;
                font-size: 1.2rem;
                cursor: pointer;
                min-height: 44px;
                display: flex;
                align-items: center;
            }

            .class-info {
                display: flex;
                flex-direction: column;
                justify-content: center;
                flex: 1;
                text-align: center;
            }

            .class-info h1 {
                margin: 0;
                font-size: 1.25rem;
                font-weight: 650;
                line-height: 1.2;
                color: var(--foreground);
            }

            .class-subtitle {
                font-size: 0.875rem;
                font-weight: 500;
                color: var(--muted-foreground);
                margin-top: 0.125rem;
            }

            /* Inline Search System */
            .inline-search-container {
                margin: 1rem 1.5rem 0 1.5rem;
                display: flex;
                align-items: center;
                gap: 0.75rem;
                flex-wrap: wrap;
            }

            .search-input-wrapper {
                position: relative;
                flex: 1;
                min-width: 200px;
                display: flex;
                align-items: center;
            }

            .search-icon {
                position: absolute;
                left: 0.75rem;
                z-index: 1;
                color: var(--muted-foreground);
            }

            .inline-search-input {
                width: 100%;
                padding: 0.75rem 0.75rem 0.75rem 2.5rem;
                font-size: 1rem;
                border: 2px solid var(--border);
                border-radius: 0.75rem;
                background: var(--card);
                color: var(--foreground);
                transition: all 0.2s;
            }

            .inline-search-input:focus {
                outline: none;
                border-color: var(--primary);
                box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
            }

            .inline-search-input::placeholder {
                color: var(--muted-foreground);
                font-size: 0.9rem;
            }

            .clear-search-btn {
                position: absolute;
                right: 0.5rem;
                background: var(--muted);
                border: 1px solid var(--border);
                border-radius: 50%;
                width: 28px;
                height: 28px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                font-size: 1rem;
                color: var(--text-secondary);
                transition: all 0.2s;
            }

            .clear-search-btn:hover {
                background: var(--border);
                color: var(--text-primary);
            }

            .search-results-count {
                font-size: 0.875rem;
                color: var(--text-secondary);
                font-weight: 500;
                white-space: nowrap;
                margin-left: auto;
            }

            /* Status Tabs */
            .status-tabs {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                background: var(--muted);
                border: 1px solid var(--border);
                border-radius: 0.75rem;
                padding: 0.25rem;
                margin: 1rem 1.5rem;
            }

            .status-tab {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 0.5rem;
                padding: 0.75rem 1rem;
                background: none;
                border: none;
                color: var(--muted-foreground);
                font-size: 0.875rem;
                font-weight: 500;
                border-radius: 0.5rem;
                cursor: pointer;
                transition: all 0.3s;
                min-height: 52px;
            }

            .status-tab.active {
                background: var(--card);
                color: var(--primary);
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
            }

            .status-icon {
                font-size: 1rem;
            }

            /* Desktop constraints */
            @media (min-width: 1024px) {
                .inline-search-container {
                    max-width: 600px;
                    margin: 1rem auto 0 auto;
                }
                
                .status-tabs {
                    max-width: 600px;
                    margin: 1rem auto;
                }
            }

            /* Desktop wide constraints */
            @media (min-width: 1400px) {
                .status-tabs {
                    max-width: 600px;
                    margin: 1rem auto;
                }
            }

            /* Responsive adjustments */
            @media (max-width: 640px) {
                .inline-search-container {
                    margin: 1rem;
                }
                
                .search-input-wrapper {
                    min-width: 120px;
                }
                
                .inline-search-input {
                    font-size: 0.9rem;
                    padding: 0.6rem 0.6rem 0.6rem 2.2rem;
                }
                
                .search-results-count {
                    font-size: 0.75rem;
                }
                
                .status-tabs {
                    margin: 1rem;
                }
            }

            @media (max-width: 480px) {
                .search-input-wrapper {
                    min-width: 100px;
                }
                
                .inline-search-input {
                    font-size: 0.85rem;
                    padding: 0.5rem 0.5rem 0.5rem 2rem;
                }
            }

            /* Mock content area */
            .mock-content {
                padding: 1rem 1.5rem;
                color: var(--muted-foreground);
                text-align: center;
                font-style: italic;
            }
        </style>
    </head>
    <body>
        <div class="entry-list-container">
            <header class="entry-list-header">
                <div class="hamburger-menu">☰</div>
                <div class="class-info">
                    <h1>Novice Container</h1>
                    <div class="class-subtitle">
                        📅 Oct 15, 2023 • 🎯 Trial 1 • 👨‍⚖️ Judge Smith • 12/25 Scored
                    </div>
                </div>
            </header>

            <!-- Inline Search Bar -->
            <div class="inline-search-container">
                <div class="search-input-wrapper">
                    <div class="search-icon">🔍</div>
                    <input
                        type="text"
                        placeholder="Search dog name, handler, breed, or armband..."
                        class="inline-search-input"
                        id="searchInput"
                    />
                    <button class="clear-search-btn" id="clearBtn" style="display: none;">✕</button>
                </div>
                <div class="search-results-count" id="resultsCount" style="display: none;"></div>
            </div>

            <div class="status-tabs">
                <button class="status-tab active">
                    <span class="status-icon">⏳</span>
                    <span style="font-size: 0.75rem; margin-right: 0.25rem;">●</span>
                    Pending (13)
                </button>
                <button class="status-tab">
                    <span class="status-icon">✓</span>
                    <span style="font-size: 0.75rem; margin-right: 0.25rem;">♦</span>
                    Completed (12)
                </button>
            </div>

            <div class="mock-content">
                Entry cards would appear here...
            </div>
        </div>

        <script>
            const searchInput = document.getElementById('searchInput');
            const clearBtn = document.getElementById('clearBtn');
            const resultsCount = document.getElementById('resultsCount');

            searchInput.addEventListener('input', function(e) {
                const value = e.target.value;
                if (value) {
                    clearBtn.style.display = 'flex';
                    resultsCount.style.display = 'block';
                    resultsCount.textContent = Math.floor(Math.random() * 20) + 5 + ' of 25';
                } else {
                    clearBtn.style.display = 'none';
                    resultsCount.style.display = 'none';
                }
            });

            clearBtn.addEventListener('click', function() {
                searchInput.value = '';
                clearBtn.style.display = 'none';
                resultsCount.style.display = 'none';
                searchInput.focus();
            });

            // Simulate some search results updating
            searchInput.addEventListener('focus', function() {
                this.style.borderColor = 'var(--primary)';
            });

            searchInput.addEventListener('blur', function() {
                this.style.borderColor = 'var(--border)';
            });
        </script>
    </body>
    </html>
  `;

  for (const viewport of viewports) {
    test(`Component Search - ${viewport.name} (${viewport.width}x${viewport.height})`, async ({ page }) => {
      // Set viewport
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      
      // Create and serve the test HTML
      const htmlContent = createTestPage(viewport.width, viewport.height);
      
      // Navigate to data URL with the HTML content
      await page.goto(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
      await page.waitForTimeout(1000);
      
      // Take initial screenshot (empty search)
      await page.screenshot({
        path: `test-results/component-empty-${viewport.name}-${viewport.width}x${viewport.height}.png`,
        fullPage: false,
        clip: { x: 0, y: 0, width: viewport.width, height: Math.min(600, viewport.height) }
      });
      
      // Test search functionality
      const searchInput = page.locator('#searchInput');
      
      // Fill with search term
      await searchInput.fill('Golden Retriever Max');
      await page.waitForTimeout(300);
      
      // Screenshot with search results
      await page.screenshot({
        path: `test-results/component-search-${viewport.name}-${viewport.width}x${viewport.height}.png`,
        fullPage: false,
        clip: { x: 0, y: 0, width: viewport.width, height: Math.min(600, viewport.height) }
      });
      
      // Test focus state
      await searchInput.focus();
      await page.waitForTimeout(200);
      await page.screenshot({
        path: `test-results/component-focus-${viewport.name}-${viewport.width}x${viewport.height}.png`,
        fullPage: false,
        clip: { x: 0, y: 0, width: viewport.width, height: Math.min(600, viewport.height) }
      });
      
      // Test clear functionality
      await page.locator('#clearBtn').click();
      await page.waitForTimeout(300);
      await page.screenshot({
        path: `test-results/component-clear-${viewport.name}-${viewport.width}x${viewport.height}.png`,
        fullPage: false,
        clip: { x: 0, y: 0, width: viewport.width, height: Math.min(600, viewport.height) }
      });
      
      // Test with longer search term to check text handling
      await searchInput.fill('This is a very long search term to test responsive behavior and text overflow handling');
      await page.waitForTimeout(300);
      await page.screenshot({
        path: `test-results/component-long-${viewport.name}-${viewport.width}x${viewport.height}.png`,
        fullPage: false,
        clip: { x: 0, y: 0, width: viewport.width, height: Math.min(600, viewport.height) }
      });
    });
  }

  test('Touch Target and Accessibility Test', async ({ page }) => {
    // Test on mobile viewport for touch targets
    await page.setViewportSize({ width: 375, height: 667 });
    
    const htmlContent = createTestPage(375, 667);
    await page.goto(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
    await page.waitForTimeout(1000);
    
    // Test touch targets by measuring clickable areas
    const searchInput = page.locator('#searchInput');
    const clearButton = page.locator('#clearBtn');
    
    await searchInput.fill('test');
    await page.waitForTimeout(300);
    
    // Measure bounding boxes for accessibility
    const searchBox = await searchInput.boundingBox();
    const clearBox = await clearButton.boundingBox();
    
    console.log(`Search input size: ${searchBox?.width}x${searchBox?.height}`);
    console.log(`Clear button size: ${clearBox?.width}x${clearBox?.height}`);
    
    // Screenshot showing touch targets highlighted
    await page.screenshot({
        path: `test-results/component-touch-targets-375x667.png`,
        fullPage: false,
        clip: { x: 0, y: 0, width: 375, height: 400 }
    });
  });
});