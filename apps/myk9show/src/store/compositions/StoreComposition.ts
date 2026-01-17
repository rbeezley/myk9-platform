/**
 * Store composition utilities for creating composable store patterns
 * This enables breaking large stores into smaller, focused stores while maintaining relationships
 */

import { StateCreator } from 'zustand';

export interface StoreSlice<T> {
  name: string;
  slice: StateCreator<T>;
}

export interface ComposedStore<T> {
  slices: StoreSlice<T>[];
  dependencies?: string[];
  loadPriority?: 'critical' | 'important' | 'lazy';
}

/**
 * Utility to compose multiple store slices into a single store
 */
export function composeStores<T>(...slices: StateCreator<T, [], [], T>[]): StateCreator<T, [], [], T> {
  return (set, get, api) => {
    const composedState = {} as T;
    
    // Apply each slice to the composed state
    slices.forEach(slice => {
      const sliceState = slice(set, get, api);
      Object.assign(composedState as Record<string, unknown>, sliceState);
    });
    
    return composedState;
  };
}

/**
 * Create a store dependency resolver
 */
export class StoreDependencyResolver {
  private dependencies: Map<string, string[]> = new Map();
  private loadOrder: string[] = [];
  
  addDependency(storeName: string, dependsOn: string[]) {
    this.dependencies.set(storeName, dependsOn);
  }
  
  resolveLoadOrder(): string[] {
    if (this.loadOrder.length > 0) {
      return this.loadOrder;
    }
    
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const result: string[] = [];
    
    const visit = (storeName: string) => {
      if (visiting.has(storeName)) {
        throw new Error(`Circular dependency detected for store: ${storeName}`);
      }
      
      if (visited.has(storeName)) {
        return;
      }
      
      visiting.add(storeName);
      
      const deps = this.dependencies.get(storeName) || [];
      deps.forEach(dep => visit(dep));
      
      visiting.delete(storeName);
      visited.add(storeName);
      result.push(storeName);
    };
    
    Array.from(this.dependencies.keys()).forEach(storeName => visit(storeName));
    
    this.loadOrder = result;
    return result;
  }
}

/**
 * Store composition patterns for related functionality
 */
export const STORE_COMPOSITIONS = {
  // Entry-related stores
  ENTRY_MANAGEMENT: {
    core: 'entryStore',
    slices: ['entryRegistrationStore', 'entryCompetitionStore', 'entryStatusStore'],
    dependencies: ['dogStore', 'showStore', 'classStore'],
  },
  
  // Search-related stores
  SEARCH_SYSTEM: {
    core: 'searchStore',
    slices: ['searchHistoryStore', 'searchAnalyticsStore', 'searchSuggestionStore'],
    dependencies: [],
  },
  
  // Template-related stores
  TEMPLATE_SYSTEM: {
    core: 'templateStore',
    slices: ['classTemplateStore', 'showTemplateStore', 'templateCacheStore'],
    dependencies: [],
  },
  
  // Show management stores
  SHOW_MANAGEMENT: {
    core: 'showStore',
    slices: ['showRegistrationStore', 'showSchedulingStore', 'showResultsStore'],
    dependencies: ['clubStore', 'userStore'],
  },
} as const;

/**
 * Store slice factory for creating consistent store slices
 */
export function createStoreSlice<T, K extends keyof T>(
  _name: string,
  initialState: Pick<T, K>,
  actions: (set: unknown, get: unknown) => Omit<T, K>
): StateCreator<T> {
  return (set, get) => ({
    ...initialState,
    ...actions(set, get),
  } as T);
}

/**
 * Memoized store selector for performance optimization
 */
export function createMemoizedSelector<T, R>(
  selector: (state: T) => R,
  equalityFn?: (a: R, b: R) => boolean
) {
  let lastResult: R;
  let lastState: T;
  
  return (state: T): R => {
    if (state === lastState) {
      return lastResult;
    }
    
    const result = selector(state);
    
    if (equalityFn && lastResult !== undefined) {
      if (equalityFn(result, lastResult)) {
        return lastResult;
      }
    }
    
    lastResult = result;
    lastState = state;
    return result;
  };
}

/**
 * Store performance metrics for monitoring
 */
export interface StoreMetrics {
  storeName: string;
  loadTime: number;
  memoryUsage: number;
  actionCount: number;
  lastAccessed: Date;
  cacheHitRate: number;
}

export class StoreMetricsCollector {
  private metrics: Map<string, StoreMetrics> = new Map();
  
  recordLoadTime(storeName: string, loadTime: number) {
    const existing = this.metrics.get(storeName);
    this.metrics.set(storeName, {
      ...existing,
      storeName,
      loadTime,
      lastAccessed: new Date(),
    } as StoreMetrics);
  }
  
  recordAction(storeName: string) {
    const existing = this.metrics.get(storeName);
    if (existing) {
      existing.actionCount++;
      existing.lastAccessed = new Date();
    }
  }
  
  getMetrics(storeName: string): StoreMetrics | undefined {
    return this.metrics.get(storeName);
  }
  
  getAllMetrics(): StoreMetrics[] {
    return Array.from(this.metrics.values());
  }
  
  clearMetrics(storeName?: string) {
    if (storeName) {
      this.metrics.delete(storeName);
    } else {
      this.metrics.clear();
    }
  }
}

// Global metrics collector instance
export const storeMetricsCollector = new StoreMetricsCollector();