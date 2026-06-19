import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { execSync } from 'node:child_process';
import { saveTemplatesPlugin } from './vite-plugins/saveTemplatesPlugin.js';
import { visualizer } from 'rollup-plugin-visualizer';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import { VitePWA } from 'vite-plugin-pwa';
// import { terser } from '@rollup/plugin-terser'; // Not needed with current config

const shouldUploadSentrySourceMaps = Boolean(
  process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
);

/**
 * Resolve the build's git reference for the About dialog. Prefer Vercel's
 * injected env vars (present during Vercel builds); otherwise fall back to local
 * `git` so dev and self-hosted builds also surface a reference. Returns empty
 * strings if git is unavailable (e.g. a tarball build with no repo).
 */
function resolveGitInfo(): { sha: string; message: string } {
  const fromEnv = {
    sha: process.env.VERCEL_GIT_COMMIT_SHA || '',
    message: process.env.VERCEL_GIT_COMMIT_MESSAGE || '',
  };
  if (fromEnv.sha || fromEnv.message) return fromEnv;
  try {
    return {
      sha: execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(),
      message: execSync('git log -1 --pretty=%s', { encoding: 'utf8' }).trim(),
    };
  } catch {
    return fromEnv;
  }
}

const gitInfo = resolveGitInfo();

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '1.0.0'),
    __BUILD_TIMESTAMP__: JSON.stringify(new Date().toISOString()),
    __GIT_COMMIT_SHA__: JSON.stringify(gitInfo.sha),
    __GIT_COMMIT_MESSAGE__: JSON.stringify(gitInfo.message),
  },
  plugins: [
    react(),
    saveTemplatesPlugin() as PluginOption,
    // PWA Configuration - injectManifest strategy for custom service worker with push support
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw-custom.ts',
      registerType: 'prompt',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,pdf}'],
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
    ...(shouldUploadSentrySourceMaps
      ? [
          sentryVitePlugin({
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
            authToken: process.env.SENTRY_AUTH_TOKEN,
            telemetry: false,
            sourcemaps: {
              filesToDeleteAfterUpload: ['./dist/**/*.map'],
            },
          }) as PluginOption,
        ]
      : []),
  ],
  optimizeDeps: {
    include: [
      'workbox-window',
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
      'canvas-confetti',
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
        manualChunks: (id: string) => {
          if (!id.includes('node_modules')) return undefined;

          // Resolve the REAL installed package name from the path after the last
          // `node_modules/`. pnpm encodes peer deps into its virtual-store dir
          // (e.g. `recharts@2_react-dom@18/`), so a naive `id.includes('react-dom')`
          // substring match misfiles every React library — which has react-dom as a
          // peer — into the react-dom chunk and drags it onto the eager critical path.
          const afterLast = id.split('node_modules/').pop() ?? '';
          const seg = afterLast.split('/');
          const pkg = seg[0]?.startsWith('@') ? `${seg[0]}/${seg[1]}` : seg[0];

          // React core — small and legitimately eager (entry depends on it).
          if (['react', 'react-dom', 'scheduler'].includes(pkg)) return 'vendor-react-dom';
          if (pkg === '@supabase' || pkg.startsWith('@supabase')) return 'vendor-supabase';

          // Everything else: NO manual chunk. Vite's automatic code-splitting routes
          // each lazy lib (recharts, react-big-calendar, @dnd-kit, …) into a dynamic
          // chunk loaded with the route that needs it, and does NOT modulepreload those
          // onto first paint. Hand-naming them, by contrast, kept giving Rollup a reason
          // to co-locate + preload the whole blob — so we let Rollup decide.
          // Statically-reachable UI primitives (@base-ui, framer-motion) correctly stay
          // eager in the entry chunk.
          return undefined;
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
    sourcemap: shouldUploadSentrySourceMaps ? 'hidden' : process.env.NODE_ENV !== 'production',
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
    // safari14.1 (not 14) is required so esbuild will lower destructuring rather than refusing.
    // The bundled service worker pulls destructuring out of workbox-precaching; with safari14
    // listed esbuild aborts the SW build (and any module importing those helpers).
    target: ['es2020', 'edge88', 'firefox78', 'chrome87', 'safari14.1'], // Modern browsers for better performance
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
      port: Number(process.env.VITE_HMR_PORT || 24678),
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
  // Worker configuration for compression worker
  worker: {
    format: 'es',
  },
});
