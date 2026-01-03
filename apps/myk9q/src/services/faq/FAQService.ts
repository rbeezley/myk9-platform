/**
 * FAQ Service
 *
 * Fetches FAQ content from Supabase and caches it in IndexedDB
 * for offline access. Unlike the full replication system, this is
 * a simpler read-only service since FAQ data:
 * - Is global (not license-key specific)
 * - Is read-only from the client
 * - Changes rarely
 * - Is a small dataset
 */

import { openDB, type IDBPDatabase } from 'idb';
import { supabase } from '@/lib/supabase';
import { logger } from '@/utils/logger';
import type {
  FAQCategory,
  FAQItem,
  FAQCategoryWithItems,
  FAQCacheData,
  FAQSyncMetadata,
} from './types';

const DB_NAME = 'myK9Q_faq';
const DB_VERSION = 1;
const STORE_NAME = 'faq_cache';
const CACHE_KEY = 'faq_data';

// Cache version - bump this to invalidate all client caches after data migration
const CACHE_VERSION = 2;

// Cache TTL: 1 hour (FAQ content doesn't change often)
const CACHE_TTL_MS = 60 * 60 * 1000;

// Listeners for cache updates
type CacheUpdateListener = () => void;
const cacheUpdateListeners = new Set<CacheUpdateListener>();

/**
 * Initialize IndexedDB for FAQ caching
 */
async function initDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    },
  });
}

/**
 * Get cached FAQ data from IndexedDB
 * Returns null if cache is missing or has outdated version
 */
async function getCachedData(): Promise<FAQCacheData | null> {
  try {
    const db = await initDB();
    const data = await db.get(STORE_NAME, CACHE_KEY) as FAQCacheData | undefined;

    if (!data) return null;

    // Invalidate cache if version doesn't match (data migration occurred)
    if (data.version !== CACHE_VERSION) {
      logger.log('[FAQService] Cache version mismatch, invalidating', {
        cached: data.version,
        current: CACHE_VERSION,
      });
      return null;
    }

    return data;
  } catch (error) {
    logger.error('[FAQService] Error reading cache:', error);
    return null;
  }
}

/**
 * Save FAQ data to IndexedDB cache
 */
async function setCachedData(data: FAQCacheData): Promise<void> {
  try {
    const db = await initDB();
    await db.put(STORE_NAME, data, CACHE_KEY);
    logger.log('[FAQService] Cache updated:', {
      categories: data.categories.length,
      items: data.items.length,
    });
  } catch (error) {
    logger.error('[FAQService] Error writing cache:', error);
  }
}

/**
 * Check if cache is stale
 */
function isCacheStale(syncMetadata: FAQSyncMetadata): boolean {
  const lastSync = new Date(syncMetadata.lastSyncAt).getTime();
  const now = Date.now();
  return now - lastSync > CACHE_TTL_MS;
}

/**
 * Fetch FAQ categories from Supabase
 */
async function fetchCategories(): Promise<FAQCategory[]> {
  const { data, error } = await supabase
    .from('faq_categories')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch categories: ${error.message}`);
  }

  return data || [];
}

/**
 * Fetch FAQ items from Supabase
 */
async function fetchItems(): Promise<FAQItem[]> {
  const { data, error } = await supabase
    .from('askq_knowledge_base')
    .select('*')
    .eq('is_active', true)
    .order('category_id', { ascending: true })
    .order('display_order', { ascending: true })
    .order('priority', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch FAQ items: ${error.message}`);
  }

  return data || [];
}

/**
 * Fetch fresh FAQ data from Supabase
 */
async function fetchFreshData(): Promise<FAQCacheData> {
  logger.log('[FAQService] Fetching fresh data from Supabase...');

  const [categories, items] = await Promise.all([
    fetchCategories(),
    fetchItems(),
  ]);

  const cacheData: FAQCacheData = {
    version: CACHE_VERSION,
    categories,
    items,
    syncMetadata: {
      lastSyncAt: new Date().toISOString(),
      categoriesCount: categories.length,
      itemsCount: items.length,
    },
  };

  logger.log('[FAQService] Fetched:', {
    categories: categories.length,
    items: items.length,
  });

  return cacheData;
}

/**
 * Notify all listeners that cache has been updated
 */
function notifyListeners(): void {
  cacheUpdateListeners.forEach((listener) => {
    try {
      listener();
    } catch (error) {
      logger.error('[FAQService] Listener error:', error);
    }
  });
}

// ============================================
// PUBLIC API
// ============================================

/**
 * Get FAQ data with offline support
 *
 * Returns cached data immediately if available, then fetches
 * fresh data in the background if cache is stale.
 *
 * @param forceRefresh - Force a fresh fetch from Supabase
 * @returns Promise resolving to FAQ categories with their items
 */
export async function getFAQData(
  forceRefresh = false
): Promise<FAQCategoryWithItems[]> {
  // Try to get cached data first
  const cached = await getCachedData();

  // If we have cached data and it's not stale (and not forcing refresh), use it
  if (cached && !forceRefresh && !isCacheStale(cached.syncMetadata)) {
    logger.log('[FAQService] Using cached data');
    return combineData(cached);
  }

  // If we have stale cache but are online, fetch fresh data
  if (navigator.onLine) {
    try {
      const freshData = await fetchFreshData();
      await setCachedData(freshData);
      notifyListeners();
      return combineData(freshData);
    } catch (error) {
      logger.error('[FAQService] Fetch error:', error);
      // Fall back to stale cache if fetch fails
      if (cached) {
        logger.log('[FAQService] Using stale cache after fetch error');
        return combineData(cached);
      }
      throw error;
    }
  }

  // Offline with cache - use cache
  if (cached) {
    logger.log('[FAQService] Offline, using cached data');
    return combineData(cached);
  }

  // Offline with no cache - return empty
  logger.warn('[FAQService] Offline with no cache, returning empty');
  return [];
}

/**
 * Get raw FAQ items (for search functionality)
 */
export async function getFAQItems(): Promise<FAQItem[]> {
  const cached = await getCachedData();
  if (cached) {
    return cached.items;
  }

  if (navigator.onLine) {
    const freshData = await fetchFreshData();
    await setCachedData(freshData);
    return freshData.items;
  }

  return [];
}

/**
 * Get raw FAQ categories
 */
export async function getFAQCategories(): Promise<FAQCategory[]> {
  const cached = await getCachedData();
  if (cached) {
    return cached.categories;
  }

  if (navigator.onLine) {
    const freshData = await fetchFreshData();
    await setCachedData(freshData);
    return freshData.categories;
  }

  return [];
}

/**
 * Force a refresh from Supabase
 */
export async function refreshFAQData(): Promise<FAQCategoryWithItems[]> {
  return getFAQData(true);
}

/**
 * Search FAQ items by keyword
 */
export async function searchFAQ(query: string): Promise<FAQItem[]> {
  const items = await getFAQItems();
  const searchTerms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);

  if (searchTerms.length === 0) {
    return [];
  }

  return items.filter((item) => {
    const text = `${item.question} ${item.answer}`.toLowerCase();
    return searchTerms.some((term) => text.includes(term));
  });
}

/**
 * Get total FAQ count
 */
export async function getFAQCount(): Promise<number> {
  const items = await getFAQItems();
  return items.length;
}

/**
 * Subscribe to cache updates
 */
export function subscribeToCacheUpdates(listener: CacheUpdateListener): () => void {
  cacheUpdateListeners.add(listener);
  return () => {
    cacheUpdateListeners.delete(listener);
  };
}

/**
 * Clear the FAQ cache (for testing or cache invalidation)
 */
export async function clearFAQCache(): Promise<void> {
  try {
    const db = await initDB();
    await db.delete(STORE_NAME, CACHE_KEY);
    logger.log('[FAQService] Cache cleared');
    notifyListeners();
  } catch (error) {
    logger.error('[FAQService] Error clearing cache:', error);
  }
}

/**
 * Get cache sync metadata
 */
export async function getSyncMetadata(): Promise<FAQSyncMetadata | null> {
  const cached = await getCachedData();
  return cached?.syncMetadata || null;
}

// ============================================
// INTERNAL HELPERS
// ============================================

/**
 * Combine categories and items into the nested structure
 */
function combineData(cacheData: FAQCacheData): FAQCategoryWithItems[] {
  const { categories, items } = cacheData;

  // Group items by category_id
  const itemsByCategory = new Map<string, FAQItem[]>();
  items.forEach((item) => {
    const categoryId = item.category_id || 'uncategorized';
    const existing = itemsByCategory.get(categoryId) || [];
    existing.push(item);
    itemsByCategory.set(categoryId, existing);
  });

  // Combine categories with their items
  return categories
    .filter((category) => itemsByCategory.has(category.id))
    .map((category) => ({
      ...category,
      items: itemsByCategory.get(category.id) || [],
    }));
}
