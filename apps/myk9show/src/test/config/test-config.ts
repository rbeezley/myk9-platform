import { defineConfig } from 'vitest/config';
import { configDefaults } from 'vitest/config';
import { devices } from 'playwright';
import path from 'path';

// Test environment configuration
export const testConfig = defineConfig({
  test: {
    // Test environment
    environment: 'jsdom',
    
    // Global setup files
    setupFiles: [
      './src/test/setup/global-setup.ts',
      './src/test/setup/mock-setup.ts'
    ],
    
    // Test patterns
    include: [
      'src/**/*.{test,spec}.{js,ts,tsx}',
      'src/test/**/*.test.{js,ts,tsx}'
    ],
    
    exclude: [
      ...configDefaults.exclude,
      'src/test/e2e/**',
      'src/test/performance/**',
      'node_modules/**',
      'dist/**'
    ],
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: [
        'src/services/**/*.ts',
        'src/components/**/*.tsx',
        'src/hooks/**/*.ts',
        'src/utils/**/*.ts',
        'src/stores/**/*.ts'
      ],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.spec.{ts,tsx}',
        'src/test/**',
        'src/**/*.d.ts',
        'src/mockData/**',
        'src/types/**'
      ],
      thresholds: {
        global: {
          branches: 75,
          functions: 75,
          lines: 75,
          statements: 75
        },
        // Service-specific thresholds (higher for critical services)
        'src/services/SearchService.ts': {
          branches: 85,
          functions: 85,
          lines: 85,
          statements: 85
        },
        'src/services/EnhancedNotificationService.ts': {
          branches: 85,
          functions: 85,
          lines: 85,
          statements: 85
        },
        'src/services/PerformanceService.ts': {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80
        }
      }
    },
    
    // Test timeouts
    testTimeout: 10000,
    hookTimeout: 10000,
    
    // Retry configuration
    retry: 2,
    
    // Reporters
    reporter: ['verbose', 'json', 'html'],
    outputFile: {
      json: './test-results/results.json',
      html: './test-results/results.html'
    },
    
    // Global test configuration
    globals: true,
    
    // Mock configuration
    clearMocks: true,
    restoreMocks: true,
    
    // Pool configuration for parallel testing
    pool: 'threads',
    poolOptions: {
      threads: {
        minThreads: 1,
        maxThreads: 4
      }
    }
  },
  
  // Path resolution for tests
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../../'),
    },
  },
});

// Performance test configuration
export const performanceTestConfig = {
  budgets: {
    // Page load budgets (milliseconds)
    pageLoad: {
      fast: 1000,
      good: 2000,
      acceptable: 3000
    },
    
    // Web Vitals budgets
    fcp: {
      fast: 800,
      good: 1200,
      acceptable: 1500
    },
    
    lcp: {
      fast: 1200,
      good: 2000,
      acceptable: 2500
    },
    
    cls: {
      fast: 0.05,
      good: 0.1,
      acceptable: 0.25
    },
    
    fid: {
      fast: 50,
      good: 100,
      acceptable: 300
    },
    
    // Resource budgets
    resources: {
      maxBundleSize: 500 * 1024, // 500KB
      maxImageSize: 500 * 1024,  // 500KB
      maxResourceDuration: 2000   // 2 seconds
    }
  },
  
  // Performance monitoring configuration
  monitoring: {
    sampleRate: 0.1, // 10% of sessions
    enableRUM: true, // Real User Monitoring
    enableSyntheticMonitoring: true,
    alertThresholds: {
      pageLoadTime: 3000,
      errorRate: 0.05, // 5%
      availability: 0.995 // 99.5%
    }
  }
};

// E2E test configuration
export const e2eTestConfig = {
  // Browser configuration
  browsers: [
    {
      name: 'chromium',
      use: {
        viewport: { width: 1280, height: 720 },
        ignoreHTTPSErrors: true,
        video: 'retain-on-failure',
        screenshot: 'only-on-failure'
      }
    },
    {
      name: 'firefox',
      use: {
        viewport: { width: 1280, height: 720 },
        ignoreHTTPSErrors: true,
        video: 'retain-on-failure',
        screenshot: 'only-on-failure'
      }
    },
    {
      name: 'webkit',
      use: {
        viewport: { width: 1280, height: 720 },
        ignoreHTTPSErrors: true,
        video: 'retain-on-failure',
        screenshot: 'only-on-failure'
      }
    }
  ],
  
  // Mobile testing
  mobileDevices: [
    {
      name: 'Mobile Chrome',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 393, height: 851 }
      }
    },
    {
      name: 'Mobile Safari',
      use: {
        ...devices['iPhone 12'],
        viewport: { width: 390, height: 844 }
      }
    }
  ],
  
  // Test configuration
  testDir: './src/test/e2e',
  timeout: 30000,
  expect: {
    timeout: 5000
  },
  
  // Retry configuration
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  
  // Reporting
  reporter: [
    ['html', { outputFolder: 'e2e-results' }],
    ['json', { outputFile: 'e2e-results/results.json' }],
    ['junit', { outputFile: 'e2e-results/junit.xml' }]
  ],
  
  // Global setup/teardown
  globalSetup: './src/test/setup/e2e-global-setup.ts',
  globalTeardown: './src/test/setup/e2e-global-teardown.ts',
  
  // Web server configuration for testing
  webServer: {
    command: 'npm run dev',
    port: 5173,
    reuseExistingServer: !process.env.CI
  }
};

// Test data configuration
export const testDataConfig = {
  // Mock user credentials
  users: {
    exhibitor: {
      email: 'exhibitor@test.com',
      password: 'Test123!',
      role: 'exhibitor'
    },
    secretary: {
      email: 'secretary@test.com',
      password: 'Test123!',
      role: 'secretary'
    },
    judge: {
      email: 'judge@test.com',
      password: 'Test123!',
      role: 'judge'
    },
    admin: {
      email: 'admin@test.com',
      password: 'Test123!',
      role: 'site_admin'
    }
  },
  
  // Test data generators
  generators: {
    show: {
      name: () => `Test Show ${Date.now()}`,
      date: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      location: () => 'Test Venue, Test City, TS',
      entryFee: () => Math.floor(Math.random() * 50) + 20 // $20-70
    },
    
    dog: {
      name: () => ['Bella', 'Max', 'Luna', 'Charlie', 'Lucy'][Math.floor(Math.random() * 5)],
      breed: () => ['Border Collie', 'Golden Retriever', 'Labrador', 'German Shepherd'][Math.floor(Math.random() * 4)],
      height: () => ['12"', '16"', '20"', '24"'][Math.floor(Math.random() * 4)]
    },
    
    entry: {
      number: () => `E${Date.now().toString().slice(-6)}`,
      status: () => ['pending', 'accepted', 'waitlist'][Math.floor(Math.random() * 3)]
    }
  },
  
  // Database seeding for tests
  seedData: {
    minShows: 5,
    maxShows: 10,
    minDogsPerUser: 1,
    maxDogsPerUser: 3,
    minEntriesPerShow: 10,
    maxEntriesPerShow: 50
  }
};

// Accessibility testing configuration
export const a11yTestConfig = {
  // axe-core configuration
  axeConfig: {
    rules: {
      'color-contrast': { enabled: true },
      'keyboard-navigation': { enabled: true },
      'focus-management': { enabled: true },
      'aria-labels': { enabled: true },
      'semantic-html': { enabled: true }
    },
    tags: ['wcag2a', 'wcag2aa', 'wcag21aa']
  },
  
  // Screen reader testing
  screenReaderTests: {
    enabled: true,
    includeVoiceOver: false, // Requires macOS
    includeNVDA: false,      // Requires Windows
    includeJAWS: false       // Requires Windows + license
  },
  
  // Keyboard navigation testing
  keyboardTests: {
    enabled: true,
    testTabOrder: true,
    testShortcuts: true,
    testFocusTraps: true
  }
};

export default testConfig;