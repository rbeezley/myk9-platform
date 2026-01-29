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
    VitePWA({
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
    }),
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
    exclude: ['workbox-window'], // Removed lucide-react - it breaks production build
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
      'react-day-picker',
      'lucide-react'
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
      // Tree shaking - less aggressive to prevent breaking icon libraries
      treeshake: {
        moduleSideEffects: true, // Changed from false - was breaking Lucide icons
        propertyReadSideEffects: true, // Changed from false
        tryCatchDeoptimization: false,
        annotations: true,
      },
      output: {
        // Simplified manual chunk splitting - avoid breaking icon libraries
        manualChunks: (id: string) => {
          if (id.includes('node_modules')) {
            // Large libraries that benefit from separate chunks
            if (id.includes('react-dom')) {
              return 'vendor-react-dom';
            }
            if (id.includes('@supabase')) {
              return 'vendor-supabase';
            }
            if (id.includes('recharts') || id.includes('d3')) {
              return 'vendor-charts';
            }
            // Let Vite handle everything else automatically
          }
          return undefined; // Let Vite decide
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
