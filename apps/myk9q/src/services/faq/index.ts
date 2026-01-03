/**
 * FAQ Service Exports
 *
 * Centralized FAQ content management with Supabase as source of truth
 * and IndexedDB caching for offline access.
 */

// Types
export type {
  FAQCategory,
  FAQItem,
  FAQCategoryWithItems,
  FAQIconName,
  FAQSyncMetadata,
  FAQCacheData,
} from './types';

// Service functions
export {
  getFAQData,
  getFAQItems,
  getFAQCategories,
  refreshFAQData,
  searchFAQ,
  getFAQCount,
  subscribeToCacheUpdates,
  clearFAQCache,
  getSyncMetadata,
} from './FAQService';

// React hooks
export { useFAQ, useFAQSearch } from './useFAQ';
