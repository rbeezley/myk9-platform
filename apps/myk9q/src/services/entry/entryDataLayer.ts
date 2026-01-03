import { Entry } from '../../stores/entryStore';
import { getEntriesFromReplicationCache, triggerImmediateEntrySync } from '../entryReplication';
import { logger } from '@/utils/logger';
import {
  fetchClassEntriesFromDatabase,
  fetchTrialEntriesFromDatabase,
  fetchEntriesByArmbandFromDatabase,
} from '../entryDataFetching';

/**
 * Entry Data Layer - Unified Interface
 *
 * Provides a single, clean interface for fetching entry data, abstracting away
 * the choice between replication cache (offline-first) and direct Supabase queries.
 *
 * **Purpose**: Single source of truth for data access
 * **Benefits**:
 * - Easy to mock for testing
 * - Consistent data access patterns
 * - Automatic fallback from cache to database
 * - Simplified consumer code
 *
 * **Phase 1, Task 1.3** - Extracted from entryService.ts
 */

/**
 * Configuration for data layer behavior
 */
interface DataLayerConfig {
  /**
   * Whether to attempt replication cache before database
   * Default: true (always try cache first for performance)
   */
  useReplication: boolean;

  /**
   * Whether to log data layer operations
   * Default: true (helps with debugging)
   */
  enableLogging: boolean;
}

/**
 * Default configuration - can be overridden per-call if needed
 */
const DEFAULT_CONFIG: DataLayerConfig = {
  useReplication: true,
  enableLogging: true,
};

/**
 * Fetch entries for one or more classes
 *
 * This is the primary data access method used by most components.
 * Automatically handles:
 * - Single vs. multiple class IDs
 * - Replication cache lookup with Supabase fallback
 * - Combined Novice A & B views
 *
 * @param classIds - Single class ID or array of class IDs
 * @param licenseKey - License key for tenant isolation
 * @param config - Optional configuration overrides
 * @returns Promise<Entry[]> - Array of entries for the specified class(es)
 *
 * @example
 * // Single class
 * const entries = await getClassEntries(123, 'license-key');
 *
 * @example
 * // Combined Novice A & B
 * const entries = await getClassEntries([123, 124], 'license-key');
 *
 * @example
 * // Force database query (skip cache)
 * const entries = await getClassEntries(123, 'license-key', { useReplication: false });
 */
export async function getClassEntries(
  classIds: number | number[],
  licenseKey: string,
  config: Partial<DataLayerConfig> = {}
): Promise<Entry[]> {
  const { useReplication } = { ...DEFAULT_CONFIG, ...config };

  try {
    // Normalize to array for consistent handling
    const classIdArray = Array.isArray(classIds) ? classIds : [classIds];
    const primaryClassId = classIdArray[0];

    // Try replication cache first (if enabled)
    if (useReplication) {
      // Pass license_key to filter entries to current show only (multi-tenant isolation)
      const cachedEntries = await getEntriesFromReplicationCache(classIdArray, primaryClassId, licenseKey);
      if (cachedEntries !== null) {
        return cachedEntries;
      }
    }

    // Fall back to direct database query
    const entries = await fetchClassEntriesFromDatabase(classIdArray, primaryClassId, licenseKey);
    return entries;
  } catch (error) {
    logger.error('[DATA_LAYER] Error fetching class entries:', error);
    throw error;
  }
}

/**
 * Fetch all entries for a specific trial
 *
 * Used by trial-level views that need to see all entries across all classes
 * in a single trial (e.g., trial results dashboard, trial statistics).
 *
 * @param trialId - The trial ID to fetch entries for
 * @param licenseKey - License key for tenant isolation
 * @param config - Optional configuration overrides
 * @returns Promise<Entry[]> - Array of all entries for the trial
 *
 * @example
 * const allEntries = await getTrialEntries(456, 'license-key');
 */
export async function getTrialEntries(
  trialId: number,
  licenseKey: string,
  _config: Partial<DataLayerConfig> = {}
): Promise<Entry[]> {
  try {
    // Note: Trial-level queries currently go directly to database
    // Replication cache is class-scoped, not trial-scoped
    // Future enhancement: Add trial-level caching if needed
    const entries = await fetchTrialEntriesFromDatabase(trialId, licenseKey);
    return entries;
  } catch (error) {
    logger.error('[DATA_LAYER] Error fetching trial entries:', error);
    throw error;
  }
}

/**
 * Fetch entries by armband number
 *
 * Used for quick lookups when scanning armbands or searching by number.
 * Useful for:
 * - Self check-in flows
 * - Armband search features
 * - Quick entry verification
 *
 * @param armband - The armband number to search for
 * @param licenseKey - License key for tenant isolation
 * @param config - Optional configuration overrides
 * @returns Promise<Entry[]> - Array of entries matching the armband (usually 0-1 results)
 *
 * @example
 * const entries = await getEntriesByArmband(101, 'license-key');
 * if (entries.length > 0) {
 *   logger.log('Found entry:', entries[0]);
 * }
 */
export async function getEntriesByArmband(
  armband: number,
  licenseKey: string,
  _config: Partial<DataLayerConfig> = {}
): Promise<Entry[]> {
  try {
    // Armband lookups go directly to database for freshest data
    // Replication cache may not have indexed by armband yet
    const entries = await fetchEntriesByArmbandFromDatabase(armband, licenseKey);
    return entries;
  } catch (error) {
    logger.error('[DATA_LAYER] Error fetching entries by armband:', error);
    throw error;
  }
}

/**
 * Trigger immediate sync for entry data
 *
 * Used after mutations (score submission, status updates) to ensure
 * the replication cache is updated immediately rather than waiting
 * for the next periodic sync.
 *
 * @param tableName - The table to sync ('entries' or 'results')
 *
 * @example
 * // After submitting a score
 * await submitScore(entryId, scoreData);
 * await triggerSync('results');
 */
export async function triggerSync(tableName: 'entries' | 'results'): Promise<void> {
  try {
await triggerImmediateEntrySync(tableName);
} catch (error) {
    logger.error(`[DATA_LAYER] Error triggering sync for ${tableName}:`, error);
    throw error;
  }
}

/**
 * Re-export types from modules for convenience
 */
export type { Entry } from '../../stores/entryStore';
