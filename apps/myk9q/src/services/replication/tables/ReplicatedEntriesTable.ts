/**
 * ReplicatedEntriesTable - Concrete Implementation for Entries Table
 *
 * This is the FIRST concrete implementation of ReplicatedTable,
 * serving as a prototype to validate the architecture before
 * implementing the remaining 16 tables.
 *
 * Phase 1 Day 5 (Prototype Validation)
 * - Demonstrates full CRUD with IndexedDB persistence
 * - Implements conflict resolution (client wins for check-in, server wins for scores)
 * - Validates subscription pattern for real-time updates
 * - Tests TTL expiration and cache invalidation
 */

import { ReplicatedTable } from '../ReplicatedTable';
import type { SyncResult } from '../types';
import { supabase } from '@/lib/supabase';
import { logger } from '@/utils/logger';

/**
 * Entry interface (subset - matches database schema)
 * Full Entry type will be imported from entryStore when integrated
 */
export interface Entry {
  id: string;               // Primary key (bigint in DB, string for IndexedDB)
  armband_number: number;
  handler_name: string;
  dog_call_name: string;
  dog_breed?: string;
  class_id: string;         // Foreign key to classes

  // Status fields
  entry_status: string;     // 'no-status' | 'checked-in' | 'at-gate' | 'in-ring' | 'completed'
  is_scored: boolean;
  is_in_ring: boolean;

  // Result fields (server-authoritative)
  result_status?: string;   // 'pending' | 'qualified' | 'nq' | 'absent' | 'excused' | 'withdrawn'
  final_placement?: number;
  search_time_seconds?: number;
  total_faults?: number;

  // Run order (exhibitor-controlled)
  exhibitor_order?: number; // Custom run order set by gate steward/exhibitors

  // Timestamps
  created_at?: string;
  updated_at?: string;

  // Multi-tenant isolation (denormalized for real-time subscription filtering)
  license_key: string;      // Auto-populated by database trigger from classes->trials->shows
}

/**
 * Raw entry from Supabase with joined data
 * Used to extract and flatten the response
 */
interface RawEntryWithJoins extends Entry {
  classes?: unknown;
}

/**
 * Concrete implementation for entries table
 */
export class ReplicatedEntriesTable extends ReplicatedTable<Entry> {
  constructor() {
    // Use default TTL from feature flags (30 min for entries)
    super('entries');
  }

  /**
   * Sync with Supabase server
   * Implements bidirectional sync:
   * 1. Download changes from server (incremental)
   * 2. Upload pending mutations
   * 3. Resolve conflicts
   *
   * OPTIMIZED: Uses batch operations to minimize IndexedDB transactions
   * Previously: 2 transactions per entry (N entries = 2N transactions)
   * Now: 1 batch transaction for all entries (N entries = 1 transaction)
   */
  async sync(licenseKey: string): Promise<SyncResult> {
    const startTime = Date.now();
    let rowsSynced = 0;
    let conflictsResolved = 0;

    try {
      // Step 1: Get last sync timestamp (single read transaction)
      // NOTE: Removed updateSyncMetadata('syncing') at start to reduce transaction count
      const metadata = await this.getSyncMetadata();

      // Check if cache is empty FOR THIS SHOW - need to know for lastSync calculation
      // CRITICAL: Pass licenseKey to filter by current show (multi-tenant isolation)
      // Without this, cache from other shows would cause incremental sync to miss data
      const allCachedEntries = await this.getAll(licenseKey);
      const isCacheEmpty = allCachedEntries.length === 0;

      // If cache is empty but we have a lastSync timestamp, it means the cache was cleared
      // Reset to epoch (0) to fetch all data
      //
      // CROSS-TAB SYNC FIX: Add a 5-second buffer to lastSync to prevent race conditions.
      // Problem: When Tab A updates entries and triggers sync, Tab B may receive the
      // real-time notification and start its own sync. If Tab B's lastIncrementalSyncAt
      // is very recent (close to or after Tab A's update timestamp), Tab B's query
      // `updated_at > lastSync` can miss the updates.
      //
      // Solution: Query for entries updated in the last 5 seconds PLUS anything newer.
      // This ensures we don't miss updates due to clock skew or timing race conditions.
      const SYNC_BUFFER_MS = 5000; // 5 seconds buffer for cross-tab sync
      const rawLastSync = isCacheEmpty ? 0 : (metadata?.lastIncrementalSyncAt || 0);
      const lastSync = rawLastSync > SYNC_BUFFER_MS ? rawLastSync - SYNC_BUFFER_MS : 0;

      // Step 2: Fetch changes from server since last sync
      // Join through: entries → classes → trials → shows.license_key
      const fetchPromise = supabase
        .from('entries')
        .select(`
          *,
          classes!inner(
            trial_id,
            trials!inner(
              show_id,
              shows!inner(
                license_key
              )
            )
          )
        `)
        .eq('classes.trials.shows.license_key', licenseKey)
        .gt('updated_at', new Date(lastSync).toISOString())
        .order('updated_at', { ascending: true });

      // Add 30 second timeout to prevent infinite hanging
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Entries fetch timed out after 30 seconds')), 30000);
      });

      let result;
      try {
        result = await Promise.race([fetchPromise, timeoutPromise]);
      } catch (_timeoutError) {
        logger.error(`[${this.tableName}] Fetch timed out, trying simpler query...`);
        // Fallback: use view instead of complex join
        result = await supabase
          .from('view_entry_class_join_normalized')
          .select('*')
          .eq('license_key', licenseKey)
          .gt('updated_at', new Date(lastSync).toISOString())
          .order('updated_at', { ascending: true });
      }

      const { data: remoteEntries, error: fetchError } = result as { data: Entry[] | null; error: unknown };

      if (fetchError) {
        logger.error(`[${this.tableName}] Fetch error:`, fetchError);
        throw fetchError;
      }

      // Step 3: OPTIMIZED - Batch process remote entries to minimize transactions
      // Instead of individual get+set per entry (2N transactions), collect all and batch (1 transaction)
      if (remoteEntries && remoteEntries.length > 0) {
        // Build a map of local entries for conflict resolution (1 transaction to read all)
        const localEntriesMap = new Map<string, Entry>();
        for (const entry of allCachedEntries) {
          localEntriesMap.set(String(entry.id), entry);
        }

        // Process all remote entries and collect for batch write
        const entriesToCache: Entry[] = [];

        for (const rawEntry of remoteEntries) {
          // Flatten the response (remove nested classes/trials/shows objects)
          const { classes: _classes, ...remoteEntry } = rawEntry as RawEntryWithJoins;

          // Convert ID to string for consistent IndexedDB key format
          const entryId = String(remoteEntry.id);
          const localEntry = localEntriesMap.get(entryId);

          if (localEntry) {
            // Conflict: both local and remote have data
            const resolved = this.resolveConflict(localEntry, remoteEntry as Entry);
            entriesToCache.push(resolved);
            conflictsResolved++;
          } else {
            // No conflict: just cache the remote entry
            entriesToCache.push({ ...remoteEntry, id: entryId } as Entry);
          }

          rowsSynced++;
        }

        // Single batch write for all entries (1 transaction instead of N*2)
        if (entriesToCache.length > 0) {
          await this.batchSet(entriesToCache);
        }
      }

      // Step 4: Upload pending mutations (Phase 2 - SyncEngine)
      // For now, just log that we would upload here
      logger.log(`[${this.tableName}] Would upload pending mutations here (Phase 2)`);

      // Step 5: Update sync metadata (single write transaction at the end)
      await this.updateSyncMetadata({
        lastIncrementalSyncAt: Date.now(),
        syncStatus: 'idle',
        errorMessage: undefined,
        conflictCount: conflictsResolved,
      });

      const duration = Date.now() - startTime;
      logger.log(`[${this.tableName}] Sync complete: ${rowsSynced} rows, ${conflictsResolved} conflicts, ${duration}ms`);

      return {
        tableName: this.tableName,
        success: true,
        operation: 'incremental-sync',
        rowsAffected: rowsSynced,
        conflictsResolved,
        duration,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Update sync metadata with error (best effort - don't re-throw if this fails)
      try {
        await this.updateSyncMetadata({
          syncStatus: 'error',
          errorMessage,
        });
      } catch (metadataError) {
        logger.error(`[${this.tableName}] Failed to update error metadata:`, metadataError);
      }

      logger.error(`[${this.tableName}] Sync failed:`, error);

      return {
        tableName: this.tableName,
        success: false,
        operation: 'incremental-sync',
        rowsAffected: rowsSynced,
        conflictsResolved,
        duration: Date.now() - startTime,
        error: errorMessage,
      };
    }
  }

  /**
   * Resolve conflicts between local and remote data
   *
   * Strategy: Server always wins.
   * - Local changes are uploaded first via MutationManager
   * - By the time we merge, server has the most recent committed state
   * - No status progression enforcement - any status can be set at any time
   *   (users need flexibility to correct mistakes or handle unexpected situations)
   */
  protected resolveConflict(local: Entry, remote: Entry): Entry {
    // Server is source of truth - just use remote data
    // Local changes were already uploaded, so remote represents latest state
    const resolved: Entry = { ...remote };

    // Ensure is_in_ring stays in sync with entry_status
    resolved.is_in_ring = remote.entry_status === 'in-ring';

    // Log when entry_status differs (for debugging sync issues)
    if (local.entry_status !== remote.entry_status) {
      logger.log(
        `[${this.tableName}] Entry ${local.id} status: local="${local.entry_status}" → remote="${remote.entry_status}"`
      );
    }

    return resolved;
  }

  /**
   * Helper: Get all entries for a specific class
   * This is the most common query pattern for entries
   * OPTIMIZED: Uses IndexedDB index for O(log n) performance instead of O(n) table scan
   */
  async getByClassId(classId: string, licenseKey?: string): Promise<Entry[]> {
    // Use indexed query for much better performance
    const entries = await this.queryByField('class_id', classId);


    // Filter by license_key if needed (for multi-tenant isolation)
    if (licenseKey) {
      return entries.filter((entry) => entry.license_key === licenseKey);
    }

    return entries;
  }

  /**
   * Helper: Get entry by armband number (within a class)
   * Used for quick lookup during scoring
   */
  async getByArmband(armbandNumber: number, classId: string): Promise<Entry | null> {
    const classEntries = await this.getByClassId(classId);
    return classEntries.find((entry) => entry.armband_number === armbandNumber) || null;
  }

  /**
   * Helper: Update entry status (optimistic update)
   * Used for check-in flow
   */
  async updateEntryStatus(
    entryId: string,
    newStatus: string,
    queueMutation = true
  ): Promise<void> {
    const entry = await this.get(entryId);
    if (!entry) {
      throw new Error(`Entry ${entryId} not found`);
    }

    // Optimistic update
    const updated: Entry = {
      ...entry,
      entry_status: newStatus,
      updated_at: new Date().toISOString(),
    };

    // Mark as dirty to queue for sync
    await this.set(entryId, updated, queueMutation);

    logger.log(`[${this.tableName}] Updated entry ${entryId} status: ${entry.entry_status} → ${newStatus}`);
  }

  /**
   * Helper: Mark entry as scored (server will calculate placement)
   * This is a local optimistic update - server processes the score
   */
  async markAsScored(
    entryId: string,
    scoreData: {
      search_time_seconds?: number;
      total_faults?: number;
      result_status?: string;
    },
    queueMutation = true
  ): Promise<void> {
    const entry = await this.get(entryId);
    if (!entry) {
      throw new Error(`Entry ${entryId} not found`);
    }

    // Optimistic update
    const updated: Entry = {
      ...entry,
      ...scoreData,
      is_scored: true,
      entry_status: 'completed',
      updated_at: new Date().toISOString(),
    };

    // Mark as dirty to queue for sync
    await this.set(entryId, updated, queueMutation);

    logger.log(`[${this.tableName}] Marked entry ${entryId} as scored`);
  }
}

/**
 * Singleton instance (for convenience)
 * Can be used directly or via ReplicationManager
 */
export const replicatedEntriesTable = new ReplicatedEntriesTable();
