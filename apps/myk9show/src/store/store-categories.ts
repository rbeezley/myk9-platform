/**
 * Store categorization for lazy loading optimization
 * This file defines which stores should be loaded immediately vs. on-demand
 */

export const STORE_CATEGORIES = {
  // Tier 1: Critical stores - Load immediately for core functionality
  // Empty for fastest initial render - all stores load on-demand
  CRITICAL: [] as const,

  // Tier 2: Important stores - Load on first access
  IMPORTANT: [
    'navigationStore', // Navigation breadcrumbs (loads when needed)
    'showStore', // For upcoming shows display
    'userStore', // Core user/people management
    'dogStore', // Core dog management
    'clubStore', // Core club management
    'searchHistoryStore', // Search history tracking
    'syncStore', // Sync status management
    'entryStore', // Entry management
    'registrationsStore', // Registration management
  ],

  // Tier 3: Feature-specific stores - Load when feature is accessed
  FEATURE_SPECIFIC: [
    'templateStore', // Template management
    'classTemplateStore', // Class template specific
    'showTemplateStore', // Show template specific
    'classCreationStore', // Class creation workflow
    'wizardStore', // Wizard states
    'classStore', // Class management
    'trialStore', // Trial management
    'competitionStore', // Competition management
    'achievementsStore', // Achievement tracking
    'armbandStore', // Armband management
    'draftStore', // Draft management
    'offlineScoringStore', // Offline scoring
    'pastResultsStore', // Past results
    'searchAnalyticsStore', // Search analytics
    'showRegistrationStore', // Show registration
  ],

  // Tier 4: UI-specific stores - Load when UI component is used
  UI_SPECIFIC: [] as string[],
} as const;

export type StoreName =
  | (typeof STORE_CATEGORIES.CRITICAL)[number]
  | (typeof STORE_CATEGORIES.IMPORTANT)[number]
  | (typeof STORE_CATEGORIES.FEATURE_SPECIFIC)[number]
  | (typeof STORE_CATEGORIES.UI_SPECIFIC)[number];

export type StoreCategory = keyof typeof STORE_CATEGORIES;

/**
 * Get the category for a specific store
 */
export function getStoreCategory(storeName: StoreName): StoreCategory {
  for (const [category, stores] of Object.entries(STORE_CATEGORIES)) {
    if ((stores as readonly string[]).includes(storeName)) {
      return category as StoreCategory;
    }
  }
  throw new Error(`Unknown store: ${storeName}`);
}

/**
 * Get all stores in a specific category
 */
export function getStoresByCategory(category: StoreCategory): readonly StoreName[] {
  return STORE_CATEGORIES[category];
}

/**
 * Check if a store is critical (should be loaded immediately)
 */
export function isCriticalStore(storeName: StoreName): boolean {
  return (STORE_CATEGORIES.CRITICAL as readonly string[]).includes(storeName);
}

/**
 * Loading priority order for stores
 */
export const STORE_LOAD_PRIORITY = {
  1: STORE_CATEGORIES.CRITICAL,
  2: STORE_CATEGORIES.IMPORTANT,
  3: STORE_CATEGORIES.FEATURE_SPECIFIC,
  4: STORE_CATEGORIES.UI_SPECIFIC,
} as const;
