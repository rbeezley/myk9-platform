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
    // PWA Configuration - injectManifest strategy for custom service worker with push support
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw-custom.ts',
      injectRegister: null,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB limit for large chunks
      },
      includeAssets: [
        'favicon.ico',
        'apple-touch-icon.png',
        'mask-icon.svg',
        'pwa-192x192.png',
        'pwa-512x512.png',
      ],
      manifest: {
        name: 'MyK9Show - Dog Show Management',
        short_name: 'MyK9Show',
        description:
          'Comprehensive dog show management platform for exhibitors, organizers, and judges',
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
            type: 'image/png',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
    // Bundle analyzer - generates stats.html
    visualizer({
      filename: 'dist/stats.html',
      open: process.env.ANALYZE_BUNDLE === 'true',
      gzipSize: true,
      brotliSize: true,
      template: 'treemap', // Options: treemap, sunburst, network
    }) as PluginOption,
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
      '@tanstack/react-query',
      'sonner',
      'framer-motion',
      '@base-ui/react',
      'react-day-picker',
      'lucide-react',
    ],
    // Force dependency optimization to prevent chunk errors
    force: true,
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
        assetFileNames: assetInfo => {
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
        entryFileNames: 'assets/scripts/[name]-[hash].js',
      },
    },
    sourcemap: process.env.NODE_ENV !== 'production',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: process.env.NODE_ENV === 'production',
        drop_debugger: process.env.NODE_ENV === 'production',
        pure_funcs: ['console.log', 'console.info', 'console.debug'],
        unused: true,
        dead_code: true,
        passes: 1,
        pure_getters: true,
        unsafe: false,
        hoist_funs: true,
        hoist_vars: true,
        reduce_vars: true,
        collapse_vars: true,
      },
      format: {
        comments: false,
        quote_style: 1,
        shorthand: true,
      },
      mangle: {
        toplevel: false,
        safari10: true,
      },
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
        './src/store/entryStore.ts',
      ],
    },
    headers: {
      // Disable caching in development more aggressively
      'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
      'Last-Modified': '0',
      ETag: 'false',
    },
    // Force reload on file changes
    hmr: {
      overlay: true,
      port: 24678,
    },
    // Force file watching
    watch: {
      usePolling: true,
      interval: 100,
    },
    // Proxy API calls during development
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    port: 4173,
    host: true,
  },
  // Environment variables
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '1.0.0'),
    __BUILD_TIMESTAMP__: JSON.stringify(new Date().toISOString()),
  },
  // Worker configuration for compression worker
  worker: {
    format: 'es',
  },
});
