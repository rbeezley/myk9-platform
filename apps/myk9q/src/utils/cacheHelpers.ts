/**
 * Cache Helper Utilities
 *
 * Pure utility functions for managing cache operations, TTL validation,
 * and cache entry filtering. Extracted from usePrefetch hook for
 * better testability and reusability.
 *
 * @module cacheHelpers
 */

/**
 * Cached data structure with timestamp and TTL
 */
export interface CachedData<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time-to-live in seconds
}

/**
 * Check if cached data is still valid based on TTL
 *
 * @param cached - The cached data entry
 * @param currentTime - Current timestamp in milliseconds (default: Date.now())
 * @returns True if data is valid, false if expired
 *
 * @example
 * ```typescript
 * const cached = { data: {...}, timestamp: Date.now() - 5000, ttl: 10 };
 * isCacheValid(cached); // true (5 seconds old, TTL is 10 seconds)
 * ```
 */
export function isCacheValid<T>(
  cached: CachedData<T>,
  currentTime: number = Date.now()
): boolean {
  const ageInSeconds = (currentTime - cached.timestamp) / 1000;
  return ageInSeconds <= cached.ttl;
}

/**
 * Get the age of cached data in seconds
 *
 * @param cached - The cached data entry
 * @param currentTime - Current timestamp in milliseconds (default: Date.now())
 * @returns Age in seconds
 *
 * @example
 * ```typescript
 * const cached = { data: {...}, timestamp: Date.now() - 5000, ttl: 60 };
 * getCacheAge(cached); // ~5
 * ```
 */
export function getCacheAge<T>(
  cached: CachedData<T>,
  currentTime: number = Date.now()
): number {
  return (currentTime - cached.timestamp) / 1000;
}

/**
 * Get remaining TTL for cached data in seconds
 *
 * @param cached - The cached data entry
 * @param currentTime - Current timestamp in milliseconds (default: Date.now())
 * @returns Remaining TTL in seconds (0 if expired)
 *
 * @example
 * ```typescript
 * const cached = { data: {...}, timestamp: Date.now() - 5000, ttl: 60 };
 * getRemainingTTL(cached); // ~55
 * ```
 */
export function getRemainingTTL<T>(
  cached: CachedData<T>,
  currentTime: number = Date.now()
): number {
  const age = getCacheAge(cached, currentTime);
  return Math.max(0, cached.ttl - age);
}

/**
 * Create a cache entry with current timestamp
 *
 * @param data - Data to cache
 * @param ttl - Time-to-live in seconds
 * @param timestamp - Timestamp in milliseconds (default: Date.now())
 * @returns Cache entry
 *
 * @example
 * ```typescript
 * const entry = createCacheEntry({ foo: 'bar' }, 60);
 * // { data: { foo: 'bar' }, timestamp: 1234567890, ttl: 60 }
 * ```
 */
export function createCacheEntry<T>(
  data: T,
  ttl: number,
  timestamp: number = Date.now()
): CachedData<T> {
  return {
    data,
    timestamp,
    ttl,
  };
}

/**
 * Filter cache keys by pattern (string or regex)
 *
 * @param keys - Array or iterator of cache keys
 * @param pattern - String or RegExp pattern to match
 * @returns Array of matching keys
 *
 * @example
 * ```typescript
 * const keys = ['user:123', 'user:456', 'post:789'];
 * filterKeysByPattern(keys, /^user:/); // ['user:123', 'user:456']
 * filterKeysByPattern(keys, 'post'); // ['post:789']
 * ```
 */
export function filterKeysByPattern(
  keys: Iterable<string>,
  pattern: string | RegExp
): string[] {
  const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
  return Array.from(keys).filter(key => regex.test(key));
}

/**
 * Convert seconds to milliseconds (for IndexedDB TTL)
 *
 * @param seconds - Time in seconds
 * @returns Time in milliseconds
 *
 * @example
 * ```typescript
 * secondsToMs(60); // 60000
 * ```
 */
export function secondsToMs(seconds: number): number {
  return seconds * 1000;
}

/**
 * Convert milliseconds to seconds (from IndexedDB TTL)
 *
 * @param milliseconds - Time in milliseconds
 * @returns Time in seconds
 *
 * @example
 * ```typescript
 * msToSeconds(60000); // 60
 * ```
 */
export function msToSeconds(milliseconds: number): number {
  return milliseconds / 1000;
}

/**
 * Generate a consistent cache key from parts
 *
 * @param parts - Parts to join into cache key
 * @returns Cache key
 *
 * @example
 * ```typescript
 * createCacheKey('entries', 123, 'scores'); // 'entries:123:scores'
 * createCacheKey('user', 'profile'); // 'user:profile'
 * ```
 */
export function createCacheKey(...parts: (string | number)[]): string {
  return parts.join(':');
}

/**
 * Parse a cache key into its parts
 *
 * @param key - Cache key to parse
 * @param separator - Separator character (default: ':')
 * @returns Array of key parts
 *
 * @example
 * ```typescript
 * parseCacheKey('entries:123:scores'); // ['entries', '123', 'scores']
 * ```
 */
export function parseCacheKey(key: string, separator: string = ':'): string[] {
  return key.split(separator);
}

/**
 * Check if cache entry should be refreshed (soft TTL check)
 *
 * Useful for implementing stale-while-revalidate pattern.
 * Returns true if data is expired OR close to expiration (within 10% of TTL).
 *
 * @param cached - The cached data entry
 * @param currentTime - Current timestamp in milliseconds (default: Date.now())
 * @returns True if should refresh
 *
 * @example
 * ```typescript
 * const cached = { data: {...}, timestamp: Date.now() - 55000, ttl: 60 };
 * shouldRefresh(cached); // true (55s old, 91% of TTL)
 * ```
 */
export function shouldRefresh<T>(
  cached: CachedData<T>,
  currentTime: number = Date.now()
): boolean {
  const remaining = getRemainingTTL(cached, currentTime);
  const refreshThreshold = cached.ttl * 0.1; // Refresh when <10% TTL remains
  return remaining <= refreshThreshold;
}
