/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { visualizer } from 'rollup-plugin-visualizer'
import path from 'path'

export default defineConfig({
  // Build-time constants - injected at compile time
  define: {
    __BUILD_TIMESTAMP__: JSON.stringify(new Date().toISOString()),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Pass env vars to tests - uses process.env (from CI) or test fallbacks
    env: {
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || 'https://test.supabase.co',
      VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || 'test-anon-key',
    },
    hookTimeout: 30000, // Increase from default 10s to 30s for IndexedDB cleanup
    testTimeout: 15000, // 15s timeout for individual tests

    // Test isolation - use forks pool for better isolation
    // vmThreads caused "multiple elements found" errors in CI due to improper cleanup
    pool: 'forks',
    // Sequential file execution to avoid module loading race conditions on Windows
    fileParallelism: false,

    exclude: [
      'node_modules/**',
      'dist/**',
      'tests/**/*.spec.ts', // Exclude Playwright tests
      'tests/**/*.spec.tsx',
      'stress_tests/**', // Exclude stress tests (separate Playwright setup)
      // Temporarily exclude tests with Vitest collection issues (tracked as technical debt)
      // Re-enabled: entryReplication.test.ts
      // Re-enabled: classCompletionService.test.ts
      // Re-enabled: entryBatchOperations.test.ts
      // Re-enabled: entryDataLayer.test.ts (fixed licenseKey assertions)
      // Re-enabled: entryStatusManagement.test.ts (fixed function signature assertions)
      // Re-enabled: entrySubscriptions.test.ts
      // Re-enabled: scoreSubmission.test.ts
      // Re-enabled: AdminNameDialog.test.tsx (added missing beforeEach import)
      // Re-enabled: AreaInputs.test.tsx, NationalsPointsDisplay.test.tsx, TimerDisplay.test.tsx
      // Re-enabled: DataManagementSection.test.tsx (added missing beforeEach import)
      // Re-enabled: DeveloperToolsSection.test.tsx
      // Re-enabled: PushNotificationSettings.test.tsx
      // Re-enabled: VoiceSettingsSection.test.tsx
    ],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
        'src/main.tsx',
        'src/vite-env.d.ts',
        'dist/',
        'public/',
      ],
    },
  },
  server: {
    host: true,
    // Enable HTTPS for mobile testing (optional)
    // https: {
    //   key: fs.readFileSync('path/to/key.pem'),
    //   cert: fs.readFileSync('path/to/cert.pem'),
    // }
  },
  build: {
    // Optimize chunk splitting
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Vendor chunks
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
              return 'react-vendor';
            }
            if (id.includes('@supabase')) {
              return 'supabase-vendor';
            }
            if (id.includes('lucide-react') || id.includes('clsx')) {
              return 'ui-vendor';
            }
            if (id.includes('@dnd-kit')) {
              return 'dnd-vendor';
            }
            if (id.includes('@tanstack/react-virtual')) {
              return 'virtual-vendor';
            }
          }
          // App chunks
          if (id.includes('/stores/')) {
            return 'stores';
          }
          if (id.includes('/services/')) {
            return 'services';
          }
        }
      }
    },
    // Increase chunk size warning limit
    chunkSizeWarningLimit: 1000,
    // Enable CSS code splitting
    cssCodeSplit: true,
    // Minify CSS
    cssMinify: true,
    // Source maps only for errors in production
    sourcemap: 'hidden'
  },
  optimizeDeps: {
    // Pre-bundle heavy dependencies
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@supabase/supabase-js',
      'zustand',
      'lucide-react'
    ]
  },
  plugins: [
    react(),
    // Bundle visualizer - generates stats.html after build
    // Run with: ANALYZE=true npm run build
    process.env.ANALYZE === 'true' ? visualizer({
      filename: 'stats.html',
      open: true,
      gzipSize: true,
      brotliSize: true,
      template: 'treemap' // or 'sunburst', 'network'
    }) : null,
    VitePWA({
      strategies: 'injectManifest', // Use our custom service worker
      srcDir: 'src',
      filename: 'sw-custom.js',
      registerType: 'prompt', // Changed from 'autoUpdate' to 'prompt' to prevent auto-reload in dev
      devOptions: {
        enabled: false, // Disabled to prevent stale chunk caching during development
        // Set to true temporarily when testing offline functionality
        type: 'module' // Use ES module service worker (bundled locally, no CDN)
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}']
      },
      manifest: {
        name: 'myK9Q',
        short_name: 'myK9Q',
        description: 'Professional dog show ring scoring application',
        theme_color: '#14b8a6',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        categories: ['sports', 'utilities'],
        icons: [
          {
            src: '/myK9Q-teal-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/myK9Q-teal-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ],
        shortcuts: [
          {
            name: 'New Score',
            short_name: 'Score',
            description: 'Start scoring a new dog',
            url: '/score/new',
            icons: [{ src: '/myK9Q-teal-192.png', sizes: '192x192' }]
          }
        ]
      },
      workbox: {
        // Precache all build artifacts including lazy-loaded chunks
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],

        // Enable navigation preload for faster page loads
        navigationPreload: true,

        // Clean up old caches automatically
        cleanupOutdatedCaches: true,

        // Use NetworkFirst strategy for API calls
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 // 1 hour
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          // Cache navigation requests (SPA routes) with CacheFirst strategy
          {
            urlPattern: ({ request, url }) => {
              // Match navigation requests to our app
              return request.mode === 'navigate' && url.origin === self.location.origin;
            },
            handler: 'CacheFirst',
            options: {
              cacheName: 'navigation-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 // 24 hours
              }
            }
          },
          // Cache JavaScript chunks with CacheFirst strategy
          {
            urlPattern: /\/assets\/.*\.js$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'js-assets-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 7 // 7 days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          // CacheFirst for CSS - matches JS strategy to prevent FOUC (Flash of Unstyled Content)
          // Vite generates content-hashed filenames, so no risk of serving stale CSS
          {
            urlPattern: /\/assets\/.*\.css$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'css-assets-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 7 // 7 days (same as JS)
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
})