/**
 * Optimized Export Utilities
 *
 * Helps eliminate unused exports and improve tree shaking
 * by providing explicit export maps and unused export detection
 */

import { logger } from '@/services/LoggingService';

/**
 * Generic function type for tree shaking helpers
 */
type AnyFunction = (...args: unknown[]) => unknown;

/**
 * Utility to create optimized barrel exports that support tree shaking
 */
export function createOptimizedExports<T extends Record<string, unknown>>(
  exports: T,
  usageMap?: Partial<Record<keyof T, boolean>>
): T {
  if (process.env.NODE_ENV === 'development' && usageMap) {
    // In development, track which exports are actually used
    const usedExports = new Set<keyof T>();
    
    const proxiedExports = new Proxy(exports, {
      get(target, prop) {
        usedExports.add(prop as keyof T);
        return target[prop as keyof T];
      }
    });

    // Log unused exports after a delay
    setTimeout(() => {
      const unusedExports = Object.keys(exports).filter(key => !usedExports.has(key as keyof T));
      if (unusedExports.length > 0) {
        logger.warn('Tree shaking opportunity: Unused exports detected', 'bundle', { unusedExports, module: 'optimizedExports' });
      }
    }, 5000);

    return proxiedExports;
  }

  return exports;
}

/**
 * Dynamic import helper with better error handling
 */
export async function dynamicImport<T = unknown>(
  importFn: () => Promise<T>,
  fallback?: T,
  context?: string
): Promise<T> {
  try {
    return await importFn();
  } catch (error) {
    logger.error(`Dynamic import failed for ${context}`, 'bundle', { context }, error as Error);
    
    if (fallback) {
      return fallback;
    }
    
    throw error;
  }
}

/**
 * Conditional import based on feature flags or conditions
 */
export async function conditionalImport<T = unknown>(
  condition: boolean | (() => boolean),
  importFn: () => Promise<T>,
  fallback?: T
): Promise<T | undefined> {
  const shouldImport = typeof condition === 'function' ? condition() : condition;
  
  if (!shouldImport) {
    return fallback;
  }
  
  try {
    return await importFn();
  } catch (error) {
    logger.error('Conditional import failed', 'bundle', {}, error as Error);
    return fallback;
  }
}

/**
 * Bundle size analyzer for development
 */
export class BundleAnalyzer {
  private static importSizes = new Map<string, { size: number; timestamp: number }>();
  
  static trackImport(moduleName: string, estimatedSize?: number) {
    if (process.env.NODE_ENV === 'development') {
      this.importSizes.set(moduleName, {
        size: estimatedSize || 0,
        timestamp: Date.now()
      });
    }
  }
  
  static getImportStats() {
    return Array.from(this.importSizes.entries()).map(([name, data]) => ({
      module: name,
      ...data
    }));
  }
  
  static reportLargeImports(sizeThreshold = 100 * 1024) { // 100KB
    const largeImports = this.getImportStats().filter(stat => stat.size > sizeThreshold);
    
    if (largeImports.length > 0) {
      logger.warn('Large imports detected', 'bundle', { largeImports });
    }
    
    return largeImports;
  }
}

/**
 * Performance-conscious re-export helper
 */
export function createLazyExport<T>(
  importFn: () => Promise<{ default: T } | T>,
  exportName: string
) {
  let cached: T | undefined;
  let importPromise: Promise<T> | undefined;
  
  return {
    async load(): Promise<T> {
      if (cached) {
        return cached;
      }
      
      if (!importPromise) {
        importPromise = importFn().then(module => {
          const result = (typeof module === 'object' && module !== null && 'default' in module) 
            ? (module as { default: T }).default 
            : module as T;
          cached = result;
          BundleAnalyzer.trackImport(exportName);
          return cached;
        });
      }
      
      return importPromise;
    },
    
    get cached() {
      return cached;
    },
    
    get isLoaded() {
      return cached !== undefined;
    }
  };
}

/**
 * Extended function type with bundler annotations
 */
interface AnnotatedFunction extends AnyFunction {
  __PURE__?: boolean;
}

/**
 * Extended module type with bundler annotations
 */
interface AnnotatedModule {
  __sideEffects?: boolean;
}

/**
 * Tree shaking helpers for common patterns
 */
export const TreeShakingHelpers = {
  /**
   * Mark a function as side-effect free for better tree shaking
   */
  pure: <T extends AnyFunction>(fn: T): T => {
    (fn as AnnotatedFunction).__PURE__ = true;
    return fn;
  },

  /**
   * Create a module with explicit side effects declaration
   */
  withSideEffects: <T>(module: T, hasSideEffects: boolean): T => {
    if (typeof module === 'object' && module !== null) {
      (module as unknown as AnnotatedModule).__sideEffects = hasSideEffects;
    }
    return module;
  },

  /**
   * Mark unused exports for development warnings
   */
  markUnused: (exportName: string, reason?: string) => {
    if (process.env.NODE_ENV === 'development') {
      logger.warn(`Export "${exportName}" marked as unused`, 'bundle', { exportName, reason });
    }
  }
};

/**
 * Bundle growth tracker for development
 */
interface BundleGrowthTracker {
  initialSize: number;
  currentSize: number;
  threshold: number;
  updateSize(newSize: number): void;
}

// Extend window for dev tools
declare global {
  interface Window {
    __bundleAnalyzer?: {
      BundleAnalyzer: typeof BundleAnalyzer;
      bundleGrowthTracker: BundleGrowthTracker;
      TreeShakingHelpers: typeof TreeShakingHelpers;
    };
  }
}

/**
 * Development-only bundle size tracking
 */
if (process.env.NODE_ENV === 'development') {
  // Track bundle size growth over time
  const bundleGrowthTracker: BundleGrowthTracker = {
    initialSize: 0,
    currentSize: 0,
    threshold: 0.1, // 10% growth warning

    updateSize(newSize: number) {
      if (this.initialSize === 0) {
        this.initialSize = newSize;
      }

      this.currentSize = newSize;
      const growthRatio = (newSize - this.initialSize) / this.initialSize;

      if (growthRatio > this.threshold) {
        logger.warn(`Bundle size grew by ${(growthRatio * 100).toFixed(1)}%`, 'bundle', {
          initial: `${(this.initialSize / 1024).toFixed(1)}KB`,
          current: `${(newSize / 1024).toFixed(1)}KB`,
          growth: `+${((newSize - this.initialSize) / 1024).toFixed(1)}KB`
        });
      }
    }
  };

  // Expose to global for debugging
  window.__bundleAnalyzer = {
    BundleAnalyzer,
    bundleGrowthTracker,
    TreeShakingHelpers
  };
}