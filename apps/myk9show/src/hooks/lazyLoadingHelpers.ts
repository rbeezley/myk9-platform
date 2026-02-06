// Pure helper functions for useLazyLoading

interface CacheEntry<T> {
  items: T[];
  totalCount: number;
  timestamp: number;
}

const CACHE_TTL_MS = 300000; // 5 minutes

/**
 * Simple cache for lazy-loaded data with TTL-based staleness.
 */
export class LazyLoadCache<T> {
  private cache = new Map<string, CacheEntry<T>>();

  get(key: string): { items: T[]; totalCount: number } | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      this.cache.delete(key);
      return null;
    }

    return { items: entry.items, totalCount: entry.totalCount };
  }

  set(key: string, items: T[], totalCount: number): void {
    this.cache.set(key, { items, totalCount, timestamp: Date.now() });
  }

  invalidateByPrefix(prefix: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }

  get totalItemCount(): number {
    let count = 0;
    for (const entry of this.cache.values()) {
      count += entry.items.length;
    }
    return count;
  }
}

/**
 * Computes the new lazy-load state after a batch is loaded.
 */
export function computeLoadState<T>(
  prevItems: T[],
  newItems: T[],
  totalCount: number,
  reset: boolean,
): { items: T[]; loadedCount: number; hasMore: boolean; totalCount: number } {
  const items = reset ? newItems : [...prevItems, ...newItems];
  const loadedCount = items.length;
  return {
    items,
    loadedCount,
    hasMore: loadedCount < totalCount,
    totalCount,
  };
}
