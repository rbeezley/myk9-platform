/**
 * FAQ Service Types
 *
 * Type definitions for the FAQ system that syncs from Supabase
 * to IndexedDB for offline access.
 */

/**
 * FAQ Category from faq_categories table
 */
export interface FAQCategory {
  id: string;
  title: string;
  icon: FAQIconName;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * FAQ Item from askq_knowledge_base table
 */
export interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category_id: string | null;
  category: string; // Legacy category string
  keywords: string[];
  priority: number;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Combined FAQ data with categories containing their items
 */
export interface FAQCategoryWithItems extends FAQCategory {
  items: FAQItem[];
}

/**
 * Supported Lucide icon names for FAQ categories
 */
export type FAQIconName =
  | 'rocket'
  | 'search'
  | 'check-circle'
  | 'clipboard'
  | 'bar-chart'
  | 'bell'
  | 'users'
  | 'shield'
  | 'wifi-off'
  | 'settings'
  | 'help-circle';

/**
 * FAQ sync metadata stored in IndexedDB
 */
export interface FAQSyncMetadata {
  lastSyncAt: string;
  categoriesCount: number;
  itemsCount: number;
}

/**
 * FAQ cache data structure stored in IndexedDB
 */
export interface FAQCacheData {
  /** Cache version - used to invalidate stale caches after migrations */
  version?: number;
  categories: FAQCategory[];
  items: FAQItem[];
  syncMetadata: FAQSyncMetadata;
}
