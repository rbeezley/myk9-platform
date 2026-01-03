/**
 * Playwright Load Testing for myK9Show Application
 * 
 * Browser-based load testing with realistic user interactions
 * targeting 100+ concurrent users with real browser scenarios
 */

import { test, expect, BrowserContext, Page } from '@playwright/test';
import { LoadTestRunner } from './LoadTestRunner';
import { LOAD_TEST_SCENARIOS, PERFORMANCE_TARGETS } from './LoadTestFramework';

// Test configuration
const LOAD_TEST_CONFIG = {
  baseUrl: process.env.BASE_URL || 'http://localhost:5173',
  concurrentUsers: {
    light: 25,
    normal: 100,
    heavy: 250,
    stress: 500
  },
  testDuration: {
    light: '5m',
    normal: '10m',
    heavy: '15m',
    stress: '20m'
  }
};

test.describe.configure({ 
  mode: 'parallel',
  timeout: 30 * 60 * 1000 // 30 minutes timeout for load tests
});

test.describe('Playwright Load Testing Suite', () => {
  let loadTestRunner: LoadTestRunner;

  test.beforeAll(async ({ browser }) => {
    loadTestRunner = new LoadTestRunner(LOAD_TEST_CONFIG.baseUrl);
    await loadTestRunner.initialize(browser);
  });

  test.afterAll(async () => {
    // Cleanup is handled by LoadTestRunner
  });

  test('should handle normal load with 100 concurrent users', async () => {
    console.log('🚀 Starting normal load test with 100 concurrent users...');
    
    const normalScenario = LOAD_TEST_SCENARIOS.find(s => s.name === 'normal_load');
    if (!normalScenario) {
      throw new Error('Normal load scenario not found');
    }

    // Override user count for this specific test
    normalScenario.virtualUsers = LOAD_TEST_CONFIG.concurrentUsers.normal;
    normalScenario.duration = LOAD_TEST_CONFIG.testDuration.normal;

    await loadTestRunner.runScenario(normalScenario);
  });

  test('should handle peak entry load with 250 concurrent users', async () => {
    console.log('🚀 Starting peak entry load test with 250 concurrent users...');
    
    const peakScenario = LOAD_TEST_SCENARIOS.find(s => s.name === 'peak_entry_load');
    if (!peakScenario) {
      throw new Error('Peak entry load scenario not found');
    }

    peakScenario.virtualUsers = LOAD_TEST_CONFIG.concurrentUsers.heavy;
    peakScenario.duration = LOAD_TEST_CONFIG.testDuration.heavy;

    await loadTestRunner.runScenario(peakScenario);
  });

  test('should handle stress load with 500 concurrent users', async () => {
    console.log('🚀 Starting stress test with 500 concurrent users...');
    
    const stressScenario = LOAD_TEST_SCENARIOS.find(s => s.name === 'stress_test');
    if (!stressScenario) {
      throw new Error('Stress test scenario not found');
    }

    stressScenario.virtualUsers = LOAD_TEST_CONFIG.concurrentUsers.stress;
    stressScenario.duration = LOAD_TEST_CONFIG.testDuration.stress;

    await loadTestRunner.runScenario(stressScenario);
  });

  test('should run comprehensive load test suite', async () => {
    console.log('🚀 Starting comprehensive load test suite...');
    
    await loadTestRunner.runAllScenarios();
  });
});

test.describe('Critical User Workflow Load Tests', () => {
  test('should handle concurrent user registration flows', async ({ browser }) => {
    console.log('👥 Testing concurrent user registration flows...');
    
    const contexts: BrowserContext[] = [];
    const pages: Page[] = [];
    
    try {
      // Create 50 concurrent registration flows
      for (let i = 0; i < 50; i++) {
        const context = await browser.newContext();
        const page = await context.newPage();
        
        contexts.push(context);
        pages.push(page);
      }
      
      const registrationPromises = pages.map(async (page, index) => {
        const startTime = Date.now();
        
        try {
          // Navigate to registration
          await page.goto(`${LOAD_TEST_CONFIG.baseUrl}/register`);
          
          // Fill registration form
          await page.fill('[data-testid="firstName"]', `TestUser${index}`);
          await page.fill('[data-testid="lastName"]', `LoadTest${index}`);
          await page.fill('[data-testid="email"]', `loadtest${index}@test.com`);
          await page.fill('[data-testid="password"]', 'test123456');
          await page.fill('[data-testid="confirmPassword"]', 'test123456');
          
          // Submit registration
          await page.click('[data-testid="register-submit"]');
          
          // Wait for success or error
          await Promise.race([
            page.waitForSelector('[data-testid="registration-success"]', { timeout: 10000 }),
            page.waitForSelector('[data-testid="registration-error"]', { timeout: 10000 })
          ]);
          
          const responseTime = Date.now() - startTime;
          console.log(`User ${index} registration completed in ${responseTime}ms`);
          
          return { success: true, responseTime, userId: index };
          
        } catch (error) {
          const responseTime = Date.now() - startTime;
          console.error(`User ${index} registration failed:`, error);
          return { success: false, responseTime, userId: index, error: error.message };
        }
      });
      
      const results = await Promise.allSettled(registrationPromises);
      
      // Analyze results
      const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
      const failed = results.length - successful;
      const responseTimes = results
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value.responseTime);
      
      const averageTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const maxTime = Math.max(...responseTimes);
      const minTime = Math.min(...responseTimes);
      
      console.log(`\n📊 Registration Load Test Results:`);
      console.log(`✅ Successful: ${successful}/${results.length} (${(successful/results.length*100).toFixed(1)}%)`);
      console.log(`❌ Failed: ${failed}/${results.length} (${(failed/results.length*100).toFixed(1)}%)`);
      console.log(`⏱️ Response Times: Min ${minTime}ms, Avg ${averageTime.toFixed(0)}ms, Max ${maxTime}ms`);
      
      // Validate performance targets
      expect(successful / results.length).toBeGreaterThan(0.95); // 95% success rate
      expect(averageTime).toBeLessThan(PERFORMANCE_TARGETS.responseTime.page);
      
    } finally {
      // Cleanup all contexts
      for (const context of contexts) {
        await context.close();
      }
    }
  });

  test('should handle concurrent show browsing and search', async ({ browser }) => {
    console.log('🔍 Testing concurrent show browsing and search...');
    
    const contexts: BrowserContext[] = [];
    const pages: Page[] = [];
    
    try {
      // Create 75 concurrent browser sessions
      for (let i = 0; i < 75; i++) {
        const context = await browser.newContext();
        const page = await context.newPage();
        
        contexts.push(context);
        pages.push(page);
      }
      
      const browsingPromises = pages.map(async (page, index) => {
        const metrics = {
          pageLoad: 0,
          searchTime: 0,
          filterTime: 0,
          total: 0
        };
        
        const startTime = Date.now();
        
        try {
          // Navigate to browse shows page
          const loadStart = Date.now();
          await page.goto(`${LOAD_TEST_CONFIG.baseUrl}/shows/browse`);
          await page.waitForLoadState('networkidle');
          metrics.pageLoad = Date.now() - loadStart;
          
          // Perform search
          const searchStart = Date.now();
          const searchTerms = ['agility', 'obedience', 'rally', 'championship'];
          const searchTerm = searchTerms[index % searchTerms.length];
          
          await page.fill('[data-testid="search-input"]', searchTerm);
          await page.click('[data-testid="search-button"]');
          await page.waitForSelector('[data-testid="search-results"]', { timeout: 5000 });
          metrics.searchTime = Date.now() - searchStart;
          
          // Apply filters
          const filterStart = Date.now();
          await page.selectOption('[data-testid="discipline-filter"]', 'Agility');
          await page.selectOption('[data-testid="location-filter"]', 'Oregon');
          await page.waitForFunction(() => 
            document.querySelectorAll('[data-testid="show-card"]').length > 0
          );
          metrics.filterTime = Date.now() - filterStart;
          
          metrics.total = Date.now() - startTime;
          
          return { success: true, metrics, userId: index };
          
        } catch (error) {
          metrics.total = Date.now() - startTime;
          return { success: false, metrics, userId: index, error: error.message };
        }
      });
      
      const results = await Promise.allSettled(browsingPromises);
      
      // Analyze results
      const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
      const failed = results.length - successful;
      const allMetrics = results
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value.metrics);
      
      // Calculate average metrics
      const avgMetrics = {
        pageLoad: allMetrics.reduce((sum, m) => sum + m.pageLoad, 0) / allMetrics.length,
        searchTime: allMetrics.reduce((sum, m) => sum + m.searchTime, 0) / allMetrics.length,
        filterTime: allMetrics.reduce((sum, m) => sum + m.filterTime, 0) / allMetrics.length,
        total: allMetrics.reduce((sum, m) => sum + m.total, 0) / allMetrics.length
      };
      
      console.log(`\n📊 Browse & Search Load Test Results:`);
      console.log(`✅ Successful: ${successful}/${results.length} (${(successful/results.length*100).toFixed(1)}%)`);
      console.log(`❌ Failed: ${failed}/${results.length} (${(failed/results.length*100).toFixed(1)}%)`);
      console.log(`⏱️ Average Metrics:`);
      console.log(`   Page Load: ${avgMetrics.pageLoad.toFixed(0)}ms`);
      console.log(`   Search: ${avgMetrics.searchTime.toFixed(0)}ms`);
      console.log(`   Filter: ${avgMetrics.filterTime.toFixed(0)}ms`);
      console.log(`   Total: ${avgMetrics.total.toFixed(0)}ms`);
      
      // Validate performance targets
      expect(successful / results.length).toBeGreaterThan(0.9); // 90% success rate
      expect(avgMetrics.pageLoad).toBeLessThan(PERFORMANCE_TARGETS.responseTime.page);
      expect(avgMetrics.searchTime).toBeLessThan(PERFORMANCE_TARGETS.responseTime.search);
      
    } finally {
      for (const context of contexts) {
        await context.close();
      }
    }
  });

  test('should handle concurrent show entry submissions', async ({ browser }) => {
    console.log('📝 Testing concurrent show entry submissions...');
    
    const contexts: BrowserContext[] = [];
    const pages: Page[] = [];
    
    try {
      // Create 100 concurrent entry submission flows
      for (let i = 0; i < 100; i++) {
        const context = await browser.newContext();
        const page = await context.newPage();
        
        // Simulate authentication
        await page.goto(`${LOAD_TEST_CONFIG.baseUrl}/sign-in`);
        await page.fill('[data-testid="email-input"]', `exhibitor${i % 10}@test.com`);
        await page.fill('[data-testid="password-input"]', 'test123');
        await page.click('[data-testid="sign-in-button"]');
        
        contexts.push(context);
        pages.push(page);
      }
      
      const entryPromises = pages.map(async (page, index) => {
        const startTime = Date.now();
        
        try {
          // Navigate to entry creation
          await page.goto(`${LOAD_TEST_CONFIG.baseUrl}/entries/create`);
          
          // Fill entry form
          await page.selectOption('[data-testid="show-select"]', 'show-1');
          await page.selectOption('[data-testid="dog-select"]', `dog-${(index % 3) + 1}`);
          await page.check('[data-testid="class-novice-a"]');
          await page.check('[data-testid="class-open-a"]');
          
          // Select payment method
          await page.check('[data-testid="payment-credit-card"]');
          
          // Submit entry
          await page.click('[data-testid="submit-entry"]');
          
          // Wait for confirmation
          await page.waitForSelector('[data-testid="entry-confirmation"]', { timeout: 15000 });
          
          const responseTime = Date.now() - startTime;
          
          return { success: true, responseTime, userId: index };
          
        } catch (error) {
          const responseTime = Date.now() - startTime;
          return { success: false, responseTime, userId: index, error: error.message };
        }
      });
      
      const results = await Promise.allSettled(entryPromises);
      
      // Analyze results
      const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
      const failed = results.length - successful;
      const responseTimes = results
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value.responseTime);
      
      const averageTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const maxTime = Math.max(...responseTimes);
      const p95Time = responseTimes.sort((a, b) => a - b)[Math.floor(responseTimes.length * 0.95)];
      
      console.log(`\n📊 Entry Submission Load Test Results:`);
      console.log(`✅ Successful: ${successful}/${results.length} (${(successful/results.length*100).toFixed(1)}%)`);
      console.log(`❌ Failed: ${failed}/${results.length} (${(failed/results.length*100).toFixed(1)}%)`);
      console.log(`⏱️ Response Times: Avg ${averageTime.toFixed(0)}ms, P95 ${p95Time}ms, Max ${maxTime}ms`);
      
      // Validate performance targets
      expect(successful / results.length).toBeGreaterThan(0.85); // 85% success rate (more lenient for complex operations)
      expect(p95Time).toBeLessThan(PERFORMANCE_TARGETS.responseTime.page * 3); // Allow 3x for complex operations
      
    } finally {
      for (const context of contexts) {
        await context.close();
      }
    }
  });

  test('should handle real-time updates under load', async ({ browser }) => {
    console.log('⚡ Testing real-time updates under load...');
    
    const contexts: BrowserContext[] = [];
    const pages: Page[] = [];
    
    try {
      // Create 50 concurrent real-time connections
      for (let i = 0; i < 50; i++) {
        const context = await browser.newContext();
        const page = await context.newPage();
        
        contexts.push(context);
        pages.push(page);
      }
      
      const realtimePromises = pages.map(async (page, index) => {
        const metrics = {
          connectionTime: 0,
          messageLatency: [],
          messagesReceived: 0
        };
        
        try {
          // Navigate to a page with real-time updates
          await page.goto(`${LOAD_TEST_CONFIG.baseUrl}/shows/live-results`);
          
          const connectionStart = Date.now();
          
          // Set up real-time message listener
          await page.evaluate(() => {
            window.realtimeMetrics = {
              messagesReceived: 0,
              latencies: []
            };
            
            // Simulate real-time connection
            if (window.EventSource) {
              const eventSource = new EventSource('/api/realtime/updates');
              
              eventSource.onopen = () => {
                window.realtimeMetrics.connectionTime = Date.now();
              };
              
              eventSource.onmessage = (event) => {
                window.realtimeMetrics.messagesReceived++;
                const messageTime = Date.now();
                
                try {
                  const data = JSON.parse(event.data);
                  if (data.timestamp) {
                    const latency = messageTime - new Date(data.timestamp).getTime();
                    window.realtimeMetrics.latencies.push(latency);
                  }
                } catch (error) {
                  console.log('Message parsing error:', error);
                }
              };
            }
          });
          
          metrics.connectionTime = Date.now() - connectionStart;
          
          // Wait for real-time updates for 30 seconds
          await page.waitForTimeout(30000);
          
          // Get metrics from page
          const pageMetrics = await page.evaluate(() => window.realtimeMetrics);
          
          metrics.messagesReceived = pageMetrics.messagesReceived;
          metrics.messageLatency = pageMetrics.latencies;
          
          return { success: true, metrics, userId: index };
          
        } catch (error) {
          return { success: false, metrics, userId: index, error: error.message };
        }
      });
      
      const results = await Promise.allSettled(realtimePromises);
      
      // Analyze results
      const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
      const failed = results.length - successful;
      const allMetrics = results
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value.metrics);
      
      const avgConnectionTime = allMetrics.reduce((sum, m) => sum + m.connectionTime, 0) / allMetrics.length;
      const totalMessages = allMetrics.reduce((sum, m) => sum + m.messagesReceived, 0);
      const allLatencies = allMetrics.flatMap(m => m.messageLatency);
      const avgLatency = allLatencies.length > 0 ? 
        allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length : 0;
      
      console.log(`\n📊 Real-time Updates Load Test Results:`);
      console.log(`✅ Successful connections: ${successful}/${results.length} (${(successful/results.length*100).toFixed(1)}%)`);
      console.log(`❌ Failed connections: ${failed}/${results.length} (${(failed/results.length*100).toFixed(1)}%)`);
      console.log(`⏱️ Average connection time: ${avgConnectionTime.toFixed(0)}ms`);
      console.log(`📨 Total messages received: ${totalMessages}`);
      console.log(`⚡ Average message latency: ${avgLatency.toFixed(0)}ms`);
      
      // Validate performance targets
      expect(successful / results.length).toBeGreaterThan(0.9); // 90% success rate
      expect(avgConnectionTime).toBeLessThan(PERFORMANCE_TARGETS.responseTime.realtime);
      if (avgLatency > 0) {
        expect(avgLatency).toBeLessThan(PERFORMANCE_TARGETS.responseTime.realtime);
      }
      
    } finally {
      for (const context of contexts) {
        await context.close();
      }
    }
  });
});

test.describe('Database Performance Under Load', () => {
  test('should handle concurrent search queries', async ({ browser }) => {
    console.log('🔍 Testing concurrent search query performance...');
    
    const context = await browser.newContext();
    const page = await context.newPage();
    
    try {
      await page.goto(`${LOAD_TEST_CONFIG.baseUrl}/shows/browse`);
      
      // Perform 100 concurrent searches
      const searchPromises = Array.from({ length: 100 }, async (_, index) => {
        const searchTerms = ['agility', 'obedience', 'rally', 'novice', 'open', 'excellent'];
        const term = searchTerms[index % searchTerms.length];
        
        const startTime = Date.now();
        
        try {
          await page.evaluate((searchTerm) => {
            return fetch(`/api/shows/search?q=${encodeURIComponent(searchTerm)}`, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json'
              }
            }).then(response => response.json());
          }, term);
          
          const responseTime = Date.now() - startTime;
          return { success: true, responseTime, term };
          
        } catch (error) {
          const responseTime = Date.now() - startTime;
          return { success: false, responseTime, term, error: error.message };
        }
      });
      
      const results = await Promise.allSettled(searchPromises);
      
      // Analyze results
      const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
      const responseTimes = results
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value.responseTime);
      
      const avgTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const p95Time = responseTimes.sort((a, b) => a - b)[Math.floor(responseTimes.length * 0.95)];
      
      console.log(`\n📊 Search Query Performance Results:`);
      console.log(`✅ Successful queries: ${successful}/${results.length}`);
      console.log(`⏱️ Average response time: ${avgTime.toFixed(0)}ms`);
      console.log(`📈 P95 response time: ${p95Time}ms`);
      
      expect(successful / results.length).toBeGreaterThan(0.95);
      expect(p95Time).toBeLessThan(PERFORMANCE_TARGETS.responseTime.search);
      
    } finally {
      await context.close();
    }
  });
});

// Test helper functions
// function sleep(ms: number): Promise<void> {
//   return new Promise(resolve => setTimeout(resolve, ms));
// }

// function generateRandomEmail(): string {
//   return `loadtest${Math.random().toString(36).substr(2, 9)}@test.com`;
// }