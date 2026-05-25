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

import {
  ReplicatedTable,
  syncReplicatedTable,
  type SyncReplicatedTableAdapter,
  type SyncResult,
} from '@myk9/replication';
import { myk9qReplicationDependencies } from '../myk9qDependencies';
import { supabase } from '@/lib/supabase';
import { logger } from '@/utils/logger';

/**
 * Entry interface (subset - matches database schema)
 * Full Entry type will be imported from entryStore when integrated
 */
export interface Entry {
  id: string; // Primary key (bigint in DB, string for IndexedDB)
  armband: number;
  handler: string;
  dog_call_name: string;
  dog_breed?: string;
  class_id: string; // Foreign key to classes

  // Status fields
  entry_status: string; // 'no-status' | 'checked-in' | 'at-gate' | 'in-ring' | 'completed'
  is_scored: boolean;
  is_in_ring: boolean;

  // Result fields (server-authoritative)
  result_status?: string; // 'pending' | 'qualified' | 'nq' | 'absent' | 'excused' | 'withdrawn'
  final_placement?: number;
  search_time_seconds?: number;
  total_faults?: number;

  // Run order (exhibitor-controlled)
  run_order?: number; // Custom run order set by gate steward/exhibitors

  // Timestamps
  created_at?: string;
  updated_at?: string;

  // Multi-tenant isolation (denormalized for real-time subscription filtering)
  license_key: string; // Auto-populated by database trigger from classes->trials->shows
}

/**
 * Concrete implementation for entries table
 */
export class ReplicatedEntriesTable extends ReplicatedTable<Entry> {
  constructor() {
    // Use default TTL from feature flags (30 min for entries)
    super('entries', undefined, myk9qReplicationDependencies);
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
    const adapter: SyncReplicatedTableAdapter<Entry, Entry> = {
      fetchRemoteRows: async ({ since, scope }) => {
        const fetchPromise = supabase
          .from('view_myk9q_entries')
          .select('*')
          .eq('license_key', scope.value ?? '')
          .gt('updated_at', new Date(since).toISOString())
          .order('updated_at', { ascending: true });

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Entries fetch timed out after 30 seconds')), 30000);
        });

        const result = (await Promise.race([fetchPromise, timeoutPromise])) as {
          data: Entry[] | null;
          error: unknown;
        };

        if (result.error) {
          logger.error(`[${this.tableName}] Fetch error:`, result.error);
          throw result.error;
        }

        return result.data ?? [];
      },
      getRemoteId: remote => String(remote.id),
      toLocalRow: remote => ({
        ...remote,
        id: String(remote.id),
        is_in_ring: remote.entry_status === 'in-ring',
      }),
      resolveConflict: (local, remote) => this.resolveConflict(local, remote),
      mergeDirtyRow: (local, remote) => ({
        ...local,
        is_scored: remote.is_scored || local.is_scored,
        result_status: remote.result_status ?? local.result_status,
        final_placement: remote.final_placement ?? local.final_placement,
        search_time_seconds: remote.search_time_seconds ?? local.search_time_seconds,
        total_faults: remote.total_faults ?? local.total_faults,
      }),
    };

    return syncReplicatedTable(this, adapter, { value: licenseKey }, { incrementalBufferMs: 5000 });
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
      return entries.filter(entry => entry.license_key === licenseKey);
    }

    return entries;
  }

  /**
   * Helper: Get entry by armband number (within a class)
   * Used for quick lookup during scoring
   */
  async getByArmband(armbandNumber: number, classId: string): Promise<Entry | null> {
    const classEntries = await this.getByClassId(classId);
    return classEntries.find(entry => entry.armband === armbandNumber) || null;
  }

  /**
   * Helper: Update entry status (optimistic update)
   * Used for check-in flow
   */
  async updateEntryStatus(entryId: string, newStatus: string, isDirty = true): Promise<void> {
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

    // isDirty=true marks the row _syncStatus:'pending', which triggers the
    // dirty-row guard at ReplicatedTable.set() so subsequent stale pulls
    // cannot overwrite the local change.
    await this.set(entryId, updated, isDirty);

    logger.log(
      `[${this.tableName}] Updated entry ${entryId} status: ${entry.entry_status} → ${newStatus}`
    );
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
    isDirty = true
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

    // isDirty=true marks the row _syncStatus:'pending', which triggers the
    // dirty-row guard at ReplicatedTable.set() so a stale replication pull
    // cannot overwrite the optimistic score (scoring-sync-bug fix).
    await this.set(entryId, updated, isDirty);

    logger.log(`[${this.tableName}] Marked entry ${entryId} as scored`);
  }
}

/**
 * Singleton instance (for convenience)
 * Can be used directly or via ReplicationManager
 */
export const replicatedEntriesTable = new ReplicatedEntriesTable();
