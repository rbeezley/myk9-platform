/**
 * Scoresheet JavaScript Bundle Preloader
 *
 * Preloads scoresheet JavaScript bundles to make navigation to scoresheets instant.
 * Works with React.lazy() components by triggering the import before navigation.
 */

import { logger } from '@/utils/logger';

// Map of scoresheet routes to their dynamic imports
const SCORESHEET_IMPORTS: Record<string, () => Promise<any>> = {
  'akc-scent-work': () => import('../pages/scoresheets/AKC/AKCScentWorkScoresheet'),
  'akc-fastcat': () => import('../pages/scoresheets/AKC/AKCFastCatScoresheet'),
  'ukc-obedience': () => import('../pages/scoresheets/UKC/UKCObedienceScoresheet'),
  'ukc-rally': () => import('../pages/scoresheets/UKC/UKCRallyScoresheet'),
  'ukc-nosework': () => import('../pages/scoresheets/UKC/UKCNoseworkScoresheet'),
  'asca-scent-detection': () => import('../pages/scoresheets/ASCA/ASCAScentDetectionScoresheet'),
};

/**
 * Cache for preloaded modules
 */
const preloadCache = new Map<string, Promise<any>>();

/**
 * Get scoresheet key from organization and element
 */
export function getScoresheetKey(org: string, element: string): string | null {
  const orgLower = org.toLowerCase();
  const elementLower = element.toLowerCase();

  // AKC Scoresheets
  if (orgLower.includes('akc')) {
    if (elementLower.includes('scent') || elementLower.includes('nosework')) {
      return 'akc-scent-work';
    }
    if (elementLower.includes('fastcat') || elementLower.includes('cat')) {
      return 'akc-fastcat';
    }
  }

  // UKC Scoresheets
  if (orgLower.includes('ukc')) {
    if (elementLower.includes('obedience')) {
      return 'ukc-obedience';
    }
    if (elementLower.includes('rally')) {
      return 'ukc-rally';
    }
    if (elementLower.includes('nosework') || elementLower.includes('scent')) {
      return 'ukc-nosework';
    }
  }

  // ASCA Scoresheets
  if (orgLower.includes('asca')) {
    if (elementLower.includes('scent') || elementLower.includes('detection')) {
      return 'asca-scent-detection';
    }
  }

  return null;
}

/**
 * Preload a scoresheet bundle
 */
export async function preloadScoresheet(key: string): Promise<void> {
  // Check if already cached
  if (preloadCache.has(key)) {
return;
  }

  const importFn = SCORESHEET_IMPORTS[key];
  if (!importFn) {
    logger.warn(`⚠️ Unknown scoresheet key: ${key}`);
    return;
  }

// Store the promise in cache
  const importPromise = importFn();
  preloadCache.set(key, importPromise);

  try {
    await importPromise;
} catch (error) {
    logger.error(`❌ Failed to preload scoresheet bundle: ${key}`, error);
    // Remove from cache on failure so it can be retried
    preloadCache.delete(key);
  }
}

/**
 * Preload scoresheet by organization and element
 */
export async function preloadScoresheetByType(org: string, element: string): Promise<void> {
  const key = getScoresheetKey(org, element);
  if (key) {
    await preloadScoresheet(key);
  }
}

/**
 * Preload all scoresheets (for use during idle time)
 */
export async function preloadAllScoresheets(): Promise<void> {
const keys = Object.keys(SCORESHEET_IMPORTS);
  await Promise.all(keys.map(key => preloadScoresheet(key)));
}

/**
 * Clear the preload cache
 */
export function clearPreloadCache(): void {
  preloadCache.clear();
}

/**
 * Get the size of the preload cache
 */
export function getPreloadCacheSize(): number {
  return preloadCache.size;
}
