import { Entry } from '../stores/entryStore';
import { getReplicationManager } from '@/services/replication';
import type { Entry as ReplicatedEntry } from '@/services/replication/tables/ReplicatedEntriesTable';
import type { Class } from '@/services/replication/tables/ReplicatedClassesTable';
import { buildClassName } from '@/utils/stringUtils';
import { formatTimeLimitSeconds } from '@/utils/timeUtils';
import { determineEntryStatus } from '@/utils/statusUtils';
import { logger } from '@/utils/logger';

/**
 * Entry Replication Module
 *
 * Handles fetching entries from the replicated cache (IndexedDB).
 * This provides fast, offline-capable access to entry data.
 *
 * **Extracted from**: entryService.ts (lines 78-166)
 * **Purpose**: Isolate replication logic from data fetching
 */

/**
 * Fetch class entries from replicated cache (IndexedDB)
 *
 * @param classIdArray - Array of class IDs to fetch entries for (supports combined Novice A & B view)
 * @param primaryClassId - The primary class ID (first in array)
 * @param licenseKey - The show's license key for multi-tenant isolation
 * @returns Entry[] from cache, or null if cache miss
 */
export async function getEntriesFromReplicationCache(
  classIdArray: number[],
  primaryClassId: number,
  licenseKey?: string
): Promise<Entry[] | null> {
const manager = getReplicationManager();
  if (!manager) {
    logger.warn('[REPLICATION] Replication manager not available');
    return null;
  }

  const entriesTable = manager.getTable<ReplicatedEntry>('entries');
  const classesTable = manager.getTable<Class>('classes');

  if (!entriesTable || !classesTable) {
    logger.warn('[REPLICATION] Tables not available in cache');
    return null;
  }

  try {
    // Get class data from cache
    const cachedClass = await classesTable.get(primaryClassId.toString());

    if (!cachedClass) {
      // This is expected during initial sync when cache is empty - don't log as warning
      // The caller will fall back to Supabase, which is the correct behavior
      return null;
    }

// Get all entries from cache and filter for requested classes
    // CRITICAL: Pass license_key to filter entries to current show only (multi-tenant isolation)
    const cachedEntries = await entriesTable.getAll(licenseKey);
    const classEntries = cachedEntries.filter(entry =>
      classIdArray.includes(parseInt(entry.class_id, 10))
    );

// Transform replicated entries to Entry format
    const mappedEntries = classEntries.map(entry => {
      const status = determineEntryStatus(entry.entry_status);

      return {
        id: parseInt(entry.id, 10),
        armband: entry.armband_number,
        callName: entry.dog_call_name,
        breed: entry.dog_breed || '',
        handler: entry.handler_name,
        jumpHeight: '',
        preferredTime: '',
        isScored: entry.is_scored || false,

        // Unified status field
        status,

        // Deprecated fields (backward compatibility)
        inRing: status === 'in-ring',
        checkedIn: status !== 'no-status',
        checkinStatus: status,

        resultText: entry.result_status || 'pending',
        searchTime: entry.search_time_seconds?.toString() || '0.00',
        faultCount: entry.total_faults || 0,
        placement: entry.final_placement ?? undefined,
        correctFinds: 0, // Not in replicated schema yet
        incorrectFinds: 0,
        noFinishCount: 0,
        totalPoints: 0,
        nqReason: undefined,
        excusedReason: undefined,
        withdrawnReason: undefined,
        classId: parseInt(entry.class_id, 10),
        className: buildClassName(cachedClass.element, cachedClass.level, cachedClass.section),
        section: cachedClass.section || '',
        element: cachedClass.element,
        level: cachedClass.level,
        timeLimit: formatTimeLimitSeconds(cachedClass.time_limit_seconds),
        timeLimit2: formatTimeLimitSeconds(cachedClass.time_limit_area2_seconds),
        timeLimit3: formatTimeLimitSeconds(cachedClass.time_limit_area3_seconds),
        areas: cachedClass.area_count,
        exhibitorOrder: entry.exhibitor_order || 0,
        actualClassId: parseInt(entry.class_id, 10),
        trialDate: '', // Would need to join with trials table
        trialNumber: ''
      };
    }).sort((a, b) => a.armband - b.armband);

return mappedEntries;

  } catch (error) {
    logger.error('❌ Error loading from replicated cache, falling back to Supabase:', error);
    return null;
  }
}

/**
 * Trigger immediate sync of entries table after mutations
 *
 * This ensures the replicated cache is updated immediately after
 * score submissions, status changes, or other mutations.
 *
 * @param operationName - Name of the operation triggering sync (for logging)
 */
export async function triggerImmediateEntrySync(operationName: string): Promise<void> {
   
  logger.log(`🔄 [${operationName}] Starting immediate entry sync...`);

  try {
    const { getReplicationManager } = await import('./replication');
    const manager = getReplicationManager();

    if (manager) {
       
      logger.log(`🔄 [${operationName}] Replication manager found, syncing entries table...`);
      await manager.syncTable('entries', { forceFullSync: false });
       
      logger.log(`✅ [${operationName}] Immediate entry sync completed`);
    } else {
      logger.warn(`[${operationName}] Replication manager not available, UI may not update until next sync`);
    }
  } catch (syncError) {
    logger.warn(`[${operationName}] Failed to trigger immediate sync (non-critical):`, syncError);
  }
}
