import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { saveTemplatesPlugin } from './vite-plugins/saveTemplatesPlugin.js';
import { visualizer } from 'rollup-plugin-visualizer';
import { VitePWA } from 'vite-plugin-pwa';
// import { terser } from '@rollup/plugin-terser'; // Not needed with current config

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    saveTemplatesPlugin() as PluginOption,
    // PWA Configuration - Enabled for asset caching and installability
    ...(true ? [VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB limit for large chunks
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              }
            }
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
              }
            }
          },
          {
            urlPattern: ({ request }) => request.destination === 'document',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pages-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 7 // 1 week
              }
            }
          },
          {
            urlPattern: ({ request }: { request: Request }) => request.destination === 'script' || request.destination === 'style',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'assets-cache',
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
              },
              matchOptions: {
                ignoreVary: true  // Fix for "Vary: Origin" header issues
              }
            }
          },
          {
            urlPattern: /^https:\/\/sojmvhhwsjxmfistvzbe\.supabase\.co\/rest\/v1\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 // 1 hour
              },
              networkTimeoutSeconds: 10
            }
          }
        ]
      },
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg', 'pwa-192x192.png', 'pwa-512x512.png'],
      manifest: {
        name: 'MyK9Show - Dog Show Management',
        short_name: 'MyK9Show',
        description: 'Comprehensive dog show management platform for exhibitors, organizers, and judges',
        theme_color: '#007AFF',
        background_color: '#ffffff',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        orientation: 'portrait-primary',
        categories: ['business', 'productivity', 'utilities'],
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })] as PluginOption[] : []),
    // Bundle analyzer - generates stats.html
    visualizer({
      filename: 'dist/stats.html',
      open: process.env.ANALYZE_BUNDLE === 'true',
      gzipSize: true,
      brotliSize: true,
      template: 'treemap' // Options: treemap, sunburst, network
    }) as PluginOption
  ],
  optimizeDeps: {
    exclude: ['lucide-react', 'workbox-window'],
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react-router-dom',
      'zustand',
      'zustand/middleware',
      '@supabase/supabase-js',
      'date-fns',
      'clsx',
      'uuid',
      '@tanstack/react-query',
      'sonner',
      'framer-motion',
      '@base-ui/react',
      'react-day-picker'
    ],
    // Force dependency optimization to prevent chunk errors
    force: true
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    // Enhanced bundle size limits for Core Web Vitals optimization
    chunkSizeWarningLimit: 500, // Reduced from 1000KB for better LCP
    rollupOptions: {
      // Enhanced tree shaking for better bundle optimization
      treeshake: {
        moduleSideEffects: false,
        propertyReadSideEffects: false,
        tryCatchDeoptimization: false,
        // Additional tree shaking options for performance
        annotations: true,
        unknownGlobalSideEffects: false,
      },
      output: {
        // Enhanced manual chunk splitting for optimal caching and loading
        manualChunks: (id: string) => {
          // Vendor chunks - more granular splitting to prevent oversized chunks
          if (id.includes('node_modules')) {
            // React ecosystem - keep small and focused
            if (id.includes('react-dom')) {
              return 'react-dom-vendor';
            }
            if (id.includes('react') && !id.includes('react-dom') && !id.includes('react-router')) {
              return 'react-vendor';
            }
            if (id.includes('react-router')) {
              return 'router-vendor';
            }
            
            // UI libraries - split further to avoid large chunks
            if (id.includes('@base-ui')) {
              return 'base-ui-vendor';
            }
            if (id.includes('@headlessui') || id.includes('framer-motion')) {
              return 'ui-vendor';
            }
            
            // Chart libraries - heavy, separate chunk for lazy loading
            if (id.includes('recharts')) {
              return 'recharts-vendor';
            }
            if (id.includes('react-big-calendar') || id.includes('d3')) {
              return 'calendar-chart-vendor';
            }
            
            // Form and validation libraries
            if (id.includes('zod')) {
              return 'validation-vendor';
            }
            if (id.includes('react-hook-form') || id.includes('@hookform')) {
              return 'form-vendor';
            }
            
            // Data management - split by functionality
            if (id.includes('@tanstack/react-query')) {
              return 'query-vendor';
            }
            if (id.includes('zustand')) {
              return 'zustand-vendor';
            }
            if (id.includes('@supabase')) {
              return 'supabase-vendor';
            }
            if (id.includes('dexie')) {
              return 'dexie-vendor';
            }
            
            // Date and time utilities
            if (id.includes('date-fns')) {
              return 'date-vendor';
            }
            
            // Small utility libraries - group together
            if (id.includes('uuid') || id.includes('clsx') || id.includes('classnames')) {
              return 'utils-vendor';
            }
            
            // Security and sanitization
            if (id.includes('dompurify') || id.includes('sanitize')) {
              return 'security-vendor';
            }
            
            // File processing - heavy, separate for lazy loading
            if (id.includes('jszip') || id.includes('xlsx')) {
              return 'file-processing-vendor';
            }
            if (id.includes('pdfmake')) {
              return 'pdf-vendor';
            }
            
            // Animation and UI effects
            if (id.includes('lottie') || id.includes('gsap')) {
              return 'animation-vendor';
            }
            
            // Development/testing libraries - only include in development builds
            if (process.env.NODE_ENV !== 'production' && (id.includes('testing-library') || id.includes('vitest') || id.includes('@faker-js'))) {
              return 'dev-vendor';
            }
            
            // Heavy utility libraries that shouldn't be in misc
            if (id.includes('lodash')) {
              return 'lodash-vendor';
            }
            
            // Icon libraries
            if (id.includes('lucide-react') || id.includes('@heroicons') || id.includes('react-icons')) {
              return 'icons-vendor';
            }
            
            // Toast and notification libraries
            if (id.includes('sonner') || id.includes('react-hot-toast')) {
              return 'notification-vendor';
            }
            
            // Remaining libraries - split further to prevent large chunks
            if (id.includes('moment') || id.includes('dayjs')) {
              return 'datetime-vendor';
            }
            if (id.includes('markdown') || id.includes('remark')) {
              return 'markdown-vendor';
            }
            if (id.includes('prism') || id.includes('highlight')) {
              return 'syntax-vendor';
            }
            if (id.includes('crypto') || id.includes('hash')) {
              return 'crypto-vendor';
            }
            
            // Split remaining misc libraries into smaller chunks
            const firstChar = id.split('/node_modules/')[1]?.charAt(0) || 'z';
            if (firstChar >= 'a' && firstChar <= 'h') {
              return 'vendor-misc-a-h';
            } else if (firstChar >= 'i' && firstChar <= 'p') {
              return 'vendor-misc-i-p';
            } else {
              return 'vendor-misc-q-z';
            }
          }
          
          // App store chunks - better organization
          if (id.includes('/store/')) {
            // Core stores
            if (id.includes('dogStore') || id.includes('userStore') || id.includes('clubStore')) {
              return 'core-stores';
            }
            // Show management stores
            if (id.includes('showStore') || id.includes('entryStore') || id.includes('registrationStore') || id.includes('wizardStore')) {
              return 'show-stores';
            }
            // Template and class stores
            if (id.includes('templateStore') || id.includes('classStore') || id.includes('classCreationStore') || id.includes('classTemplateStore')) {
              return 'template-stores';
            }
            // Admin and system stores
            if (id.includes('syncStore') || id.includes('performanceStore') || id.includes('navigationStore')) {
              return 'system-stores';
            }
            // Remaining stores
            return 'misc-stores';
          }
          
          // Page chunks - role-based splitting
          if (id.includes('/pages/')) {
            if (id.includes('/admin/')) {
              return 'admin-pages';
            }
            if (id.includes('/secretary/')) {
              return 'secretary-pages';
            }
            if (id.includes('/judge/') || id.includes('Judge')) {
              return 'judge-pages';
            }
            if (id.includes('/exhibitor/') || id.includes('Exhibitor')) {
              return 'exhibitor-pages';
            }
            // Core pages - split further to reduce chunk size
            if (id.includes('DogDetailsPage') || id.includes('UserDetailsPage') || id.includes('ShowDetailsPage')) {
              return 'detail-pages';
            }
            // Split common pages by functionality
            if (id.includes('Home') || id.includes('Landing') || id.includes('Auth')) {
              return 'core-pages';
            }
            if (id.includes('Profile') || id.includes('Settings') || id.includes('Account')) {
              return 'user-pages';  
            }
            if (id.includes('Browse') || id.includes('Search') || id.includes('List')) {
              return 'browse-pages';
            }
            return 'misc-pages';
          }
          
          // Component chunks - feature-based with critical path optimization
          if (id.includes('/components/')) {
            // Critical home page components - load immediately
            if (id.includes('landing/Hero') || id.includes('landing/Navigation') || id.includes('landing/FeaturesGrid')) {
              return 'home-critical';
            }
            
            // Large performance-heavy components - lazy load
            if (id.includes('LoadTestDashboard') || id.includes('PerformanceDashboard') || id.includes('DataLifecycleManagement')) {
              return 'performance-components';
            }
            
            // Show creation wizard - heavy, lazy load
            if (id.includes('ShowCreationWizard') || id.includes('wizard/')) {
              return 'wizard-components';
            }
            
            // Calendar and scheduling - heavy, lazy load
            if (id.includes('calendar') || id.includes('Calendar') || id.includes('scheduling')) {
              return 'calendar-components';
            }
            
            // Registration workflow - heavy, lazy load
            if (id.includes('registration') || id.includes('Registration') || id.includes('workflow')) {
              return 'registration-components';
            }
            
            // Charts and analytics - heavy, lazy load
            if (id.includes('charts') || id.includes('analytics') || id.includes('Analytics')) {
              return 'analytics-components';
            }
            
            // Template management - heavy, lazy load
            if (id.includes('template') || id.includes('Template')) {
              return 'template-components';
            }
            
            // UI components - group common ones
            if (id.includes('/ui/') || id.includes('shadcn')) {
              return 'ui-components';
            }
          }
          
          // Services and utilities
          if (id.includes('/services/')) {
            return 'app-services';
          }
          
          if (id.includes('/utils/') || id.includes('/hooks/')) {
            return 'app-utils';
          }
        },
        assetFileNames: (assetInfo) => {
          // Organize assets in subfolders for CDN optimization
          if (!assetInfo.name) return 'assets/[name]-[hash][extname]';
          
          let extType = assetInfo.name.split('.').at(1) || '';
          if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(extType)) {
            extType = 'images';
          } else if (/css/i.test(extType)) {
            extType = 'styles';
          } else if (/js/i.test(extType)) {
            extType = 'scripts';
          }
          return `assets/${extType}/[name]-[hash][extname]`;
        },
        chunkFileNames: 'assets/scripts/[name]-[hash].js',
        entryFileNames: 'assets/scripts/[name]-[hash].js'
      }
    },
    // Enable source maps for better debugging
    sourcemap: process.env.NODE_ENV !== 'production',
    // Enhanced bundle optimization for Core Web Vitals - FIXED VERSION
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: process.env.NODE_ENV === 'production',
        drop_debugger: process.env.NODE_ENV === 'production',
        pure_funcs: ['console.log', 'console.info', 'console.debug'],
        // Enhanced tree shaking and dead code elimination
        unused: true,
        dead_code: true,
        // FIXED: Remove side_effects: false to prevent infinite analysis loops
        // Advanced compression options for better LCP  
        passes: 1, // FIXED: Reduced from 2 to prevent exponential processing time
        pure_getters: true,
        unsafe: false, // Keep safe for React apps
        // Reduce bundle size further
        hoist_funs: true,
        hoist_vars: true,
        reduce_vars: true,
        collapse_vars: true,
      },
      format: {
        comments: false,
        // Reduce output size
        quote_style: 1, // Use single quotes
        shorthand: true,
      },
      mangle: {
        // FIXED: Simplified mangling to prevent conflicts
        // Remove property mangling regex that could cause issues
        // Mangle top-level names for better compression
        toplevel: false, // FIXED: Disabled to prevent conflicts with manual chunking
        safari10: true, // Fix Safari 10 compatibility
      }
    },
    // Code splitting settings - optimized for Core Web Vitals
    target: ['es2020', 'edge88', 'firefox78', 'chrome87', 'safari14'], // Modern browsers for better performance
    cssCodeSplit: true,
    // Asset optimization - optimized for LCP
    assetsInlineLimit: 4096, // Increased from 2048 for better caching vs requests trade-off
    
    // Enhanced build performance
    reportCompressedSize: false, // Disable in CI for faster builds
    
    // Optimize for production deployment
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    host: '0.0.0.0', // Allow external connections for testing
    // Preload critical modules for faster loading
    warmup: {
      clientFiles: [
        './src/store/dogStore.ts',
        './src/store/userStore.ts', 
        './src/store/clubStore.ts',
        './src/store/entryStore.ts'
      ]
    },
    headers: {
      // Disable caching in development more aggressively
      'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Last-Modified': '0',
      'ETag': 'false'
    },
    // Force reload on file changes
    hmr: {
      overlay: true,
      port: 24678
    },
    // Force file watching
    watch: {
      usePolling: true,
      interval: 100
    },
    // Proxy API calls during development
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:3000',
        changeOrigin: true,
        secure: false
      }
    }
  },
  preview: {
    port: 4173,
    host: true
  },
  // Environment variables
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '1.0.0')
  },
  // Worker configuration for compression worker
  worker: {
    format: 'es'
  }
});
