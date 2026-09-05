/**
 * ReplicatedEntriesTable - Offline-first entry data replication for myK9Show
 *
 * Manages entry/registration data with offline support using @myk9/replication.
 * Entries represent a dog+handler registered for a specific class.
 *
 * Conflict Resolution:
 * - Last-write-wins for most fields
 * - Check-in status: local takes precedence (offline check-ins are authoritative)
 */

import {
  ReplicatedTable,
  syncReplicatedTable,
  parseUpdatedAtMs,
  REPLICATION_INCREMENTAL_BUFFER_MS_HIGH_CHURN,
  type SyncReplicatedTableAdapter,
  type SyncResult,
} from '@myk9/replication';
import { logger } from '@myk9/core';
import type { CheckInStatus } from '@myk9/core';
import { supabase } from '@/services/database/supabaseClient';
import { getSyncErrorMessage, isAbortSyncError } from './syncErrorUtils';
import {
  entryToSupabaseRow,
  rowToEntry,
  type EntryRow,
  type ReplicatedEntry,
} from './ReplicatedEntriesTable.mapper';
import { buildRingsideRpcFields, RINGSIDE_RPC_FUNCTION } from './ringsideEntryRpc';

export { rowToEntry };
export type { ReplicatedEntry };

export class ReplicatedEntriesTable extends ReplicatedTable<ReplicatedEntry> {
  /** Most recent mutation ID from a create/update operation */
  private _lastMutationId: string | null = null;
  private _hasWarnedMissingShowScope = false;
  private readonly _syncsByShow = new Map<string, Promise<SyncResult>>();

  /**
   * IDs deleted locally this session. The download sync skips these
   * so it doesn't resurrect entries the user just deleted.
   */
  private _deletedIds: Set<string> = new Set();

  constructor() {
    super('entries', { logger });
  }

  /** Get the mutation ID from the last create/update operation */
  get lastMutationId(): string | null {
    return this._lastMutationId;
  }

  protected override rebuildUpdatePayload(entry: ReplicatedEntry): Record<string, unknown> {
    return entryToSupabaseRow(entry);
  }

  async sync(syncScopeId: string): Promise<SyncResult> {
    const showScopeId = syncScopeId.trim();
    if (!showScopeId) {
      if (!this._hasWarnedMissingShowScope) {
        logger.warn(`[${this.getTableName()}] Skipping remote sync without show scope`);
        this._hasWarnedMissingShowScope = true;
      }
      return {
        tableName: this.getTableName(),
        success: true,
        operation: 'incremental-sync',
        rowsAffected: 0,
        duration: 0,
      };
    }

    // Background replication and report reads can request the same show together.
    // Share only the active operation; the next refresh must still contact the server.
    const inFlight = this._syncsByShow.get(showScopeId);
    if (inFlight) return inFlight;
    const sync = this.syncShow(showScopeId).finally(() => {
      this._syncsByShow.delete(showScopeId);
    });
    this._syncsByShow.set(showScopeId, sync);
    return sync;
  }

  private async syncShow(showScopeId: string): Promise<SyncResult> {
    logger.log(`[${this.getTableName()}] Starting sync`);

    const adapter: SyncReplicatedTableAdapter<EntryRow, ReplicatedEntry> = {
      getRemoteRowCount: async () => {
        try {
          const { count, error } = await supabase
            .from('view_authenticated_entry_results_replication')
            .select('id', { count: 'exact', head: true })
            .eq('show_id', showScopeId);

          if (error) {
            logger.warn(
              `[${showScopeId}] Entries coverage count unavailable; continuing sync`,
              'replication',
              { message: error.message }
            );
            return undefined;
          }

          return count ?? 0;
        } catch (error) {
          logger.warn(
            `[${showScopeId}] Entries coverage count unavailable; continuing sync`,
            'replication',
            { message: error instanceof Error ? error.message : String(error) }
          );
          return undefined;
        }
      },
      fetchRemoteRows: async ({ since }) => {
        // Filter by show_id if provided. In myK9Show this scope value is the Show ID.
        // Read through the authenticated result view instead of public.entries:
        // managers receive raw scored fields, while exhibitors only receive
        // their own entries with result columns nulled by the release cascade.
        // The view flattens dog display fields as dog_call_name/dog_breed.
        let query = supabase
          .from('view_authenticated_entry_results_replication')
          .select('*')
          .gt('updated_at', new Date(since).toISOString())
          .order('updated_at', { ascending: true });

        query = query.eq('show_id', showScopeId);

        const { data, error } = await query;

        if (error) {
          throw new Error(`Entries refresh failed: ${error.message}`);
        }

        return (data ?? []) as unknown as EntryRow[];
      },
      getRemoteId: remote => {
        return String(remote.id);
      },
      getRemoteUpdatedAt: remote => parseUpdatedAtMs(remote.updated_at),
      toLocalRow: rowToEntry,
      // After a non-conflicting dirty sync-down reconciles a row, a queued full-row
      // direct UPDATE (updateStatus/updateEntry) must be refreshed to the merged
      // payload so advancing its OCC token doesn't clobber server-changed untouched
      // fields (e.g. final_placement bumped by the recalc trigger). RPC writes carry
      // a delta and don't need this.
      rebuildUpdatePayload: entry => entryToSupabaseRow(entry),
      filterLocalRows: (rows, scope) =>
        scope.value ? rows.filter(row => row.showId === scope.value) : rows,
      resolveConflict: (local, remote) => this.resolveConflict(local, remote),
      shouldSkipRemoteRow: remote => {
        const entryId = String(remote.id);
        const shouldSkip = this._deletedIds.has(entryId);
        if (shouldSkip) {
          logger.log(`[${this.getTableName()}] Skipping deleted entry ${entryId} during sync`);
        }
        return shouldSkip;
      },
      afterSuccessfulSync: async ({ serverIds, localRows }) => {
        const pendingCount = await this.getMutationPendingCount();
        if (pendingCount > 0) {
          return;
        }

        for (const local of localRows) {
          if (local._localOnly && !serverIds.has(local.id)) {
            logger.log(`[${this.getTableName()}] Removing orphan local entry ${local.id}`);
            await this.delete(local.id);
          }
        }

        // Safe to clear deleted IDs — all DELETEs have been uploaded.
        this._deletedIds.clear();
      },
    };

    const result = await syncReplicatedTable(
      this,
      adapter,
      { value: showScopeId },
      {
        incrementalBufferMs: REPLICATION_INCREMENTAL_BUFFER_MS_HIGH_CHURN,
      }
    );

    if (!result.success && result.error && !isAbortSyncError(result.error)) {
      logger.error(`[${this.getTableName()}] Sync failed:`, result.error);
      return { ...result, error: getSyncErrorMessage(result.error) };
    }

    return result;
  }

  /**
   * Conflict resolution for entries.
   * If the local entry has unsynced changes (pending mutation), keep it so the
   * write is not overwritten by a stale server snapshot before it uploads.
   * Server state is applied on the next sync after the mutation is uploaded.
   */
  protected resolveConflict(local: ReplicatedEntry, remote: ReplicatedEntry): ReplicatedEntry {
    if (local._syncStatus === 'pending') {
      return local;
    }
    return remote;
  }

  /**
   * Get entries by class ID
   */
  async getEntriesByClass(classId: string): Promise<ReplicatedEntry[]> {
    const all = await this.getAll();
    return all.filter(e => e.classId === classId);
  }

  /**
   * Get entries by show ID
   */
  async getEntriesByShow(showId: string): Promise<ReplicatedEntry[]> {
    const all = await this.getAll();
    return all.filter(e => e.showId === showId);
  }

  /**
   * Get entries by armband number
   */
  async getEntriesByArmband(armband: string): Promise<ReplicatedEntry[]> {
    const all = await this.getAll();
    return all.filter(e => e.armband === armband);
  }

  /**
   * Get entry by ID
   */
  async getEntryById(entryId: string): Promise<ReplicatedEntry | null> {
    return this.get(entryId);
  }

  /**
   * Load an entry for a write, hydrating the local replica from the server on
   * a cache miss.
   *
   * Pages like secretary Entry Management read their lists via PostgREST and
   * never run a per-show entries sync (only /at-show and scoring surfaces call
   * `sync(showId)`), so in a fresh browser profile the replica is cold and the
   * first check-in / day-of scratch would fail with "Entry not found" even
   * though the entry exists server-side. Hydration reads the same view the
   * sync adapter uses and seeds a clean row carrying its OCC serverVersion, so
   * the queued mutation's precondition matches the server. Offline misses
   * still throw the canonical not-found error: there is nothing to write
   * against, and the caller's retry UX handles it.
   */
  private async getOrHydrateEntry(entryId: string): Promise<ReplicatedEntry> {
    const cached = await this.get(entryId);
    if (cached) return cached;

    // An entry deleted locally this session must not be resurrected by a write.
    if (!this._deletedIds.has(entryId)) {
      try {
        const { data, error } = await supabase
          .from('view_authenticated_entry_results')
          .select('*')
          .eq('id', entryId)
          .maybeSingle();

        // Re-check after the await: a deleteEntry() for this id may have landed
        // while the fetch was in flight, and must still win the race.
        if (!error && data && !this._deletedIds.has(entryId)) {
          const row = data as unknown as EntryRow;
          const hydrated = rowToEntry(row);
          const serverVersion = (row as Record<string, unknown>).version as number | undefined;
          await this.set(entryId, hydrated, false, undefined, serverVersion);
          logger.log(`[${this.getTableName()}] Hydrated cold-replica entry ${entryId} for write`);
          return hydrated;
        }
      } catch (error) {
        logger.warn(`[${this.getTableName()}] Cold-replica hydration failed for ${entryId}`, error);
      }
    }

    throw new Error(`Entry ${entryId} not found`);
  }

  /**
   * Update entry status (offline-first)
   * @returns mutation ID if queued, null if no MutationManager
   */
  async updateEntryStatus(entryId: string, status: string): Promise<string | null> {
    const entry = await this.getOrHydrateEntry(entryId);

    const updated: ReplicatedEntry = {
      ...entry,
      status,
      entryStatus: status,
      entry_status: status,
      _lastModified: new Date(),
      _syncStatus: 'pending',
    };

    await this.set(entryId, updated, true);
    const mutationId = await this.queueMutation('UPDATE', entryId, entryToSupabaseRow(updated));
    this._lastMutationId = mutationId;
    logger.log(`[${this.getTableName()}] Updated entry ${entryId} status to ${status}`);
    return mutationId;
  }

  /**
   * Update only the show-day check-in status.
   *
   * This deliberately queues a narrow payload because handler/self check-in
   * policies allow `check_in_status` changes without granting broad row writes.
   */
  async updateCheckInStatus(entryId: string, status: CheckInStatus): Promise<string | null> {
    const entry = await this.getOrHydrateEntry(entryId);

    const updated: ReplicatedEntry = {
      ...entry,
      checkInStatus: status,
      check_in_status: status,
      _lastModified: new Date(),
      _syncStatus: 'pending',
    };

    await this.set(entryId, updated, true);
    const mutationId = await this.queueMutation(
      'UPDATE',
      entryId,
      {
        id: entryId,
        check_in_status: status,
        updated_at: new Date().toISOString(),
      },
      undefined,
      // check_in_status is ringside-whitelisted; route through the RPC so judges/
      // stewards can persist check-ins (updated_at is auto-managed, not intent).
      { name: RINGSIDE_RPC_FUNCTION, fields: { check_in_status: status } }
    );
    this._lastMutationId = mutationId;
    logger.log(`[${this.getTableName()}] Updated entry ${entryId} check-in status to ${status}`);
    return mutationId;
  }

  /**
   * Update entry (marks as dirty for sync)
   * @returns mutation ID if queued, null if no MutationManager
   */
  async updateEntry(entryId: string, updates: Partial<ReplicatedEntry>): Promise<string | null> {
    const entry = await this.getOrHydrateEntry(entryId);

    const updated: ReplicatedEntry = {
      ...entry,
      ...updates,
      _lastModified: new Date(),
      _syncStatus: 'pending',
    };

    const supabaseRow = entryToSupabaseRow(updated);
    // Auto-route ringside-only writes (scoring/run-order/check-in/placement)
    // through the SECURITY DEFINER RPC so assigned judges / stewards — who are
    // denied by the entries UPDATE RLS policy — can persist. Writes that touch
    // any non-ringside column fall through to the direct UPDATE. See
    // ./ringsideEntryRpc.ts.
    const rpcFields = buildRingsideRpcFields(Object.keys(updates), supabaseRow);

    // Durable-first: queue the mutation BEFORE mutating the local cache. If the
    // queue write THROWS (overflow/quota), the optimistic cache is never touched,
    // so we don't strand a dirty row that shows as saved but has no mutation to
    // upload — the caller's error path leaves the list unchanged. (There is no
    // orphan-repair to rescue such a row.) The OCC serverVersion precondition
    // reads the pre-update cache row, which our optimistic edit hasn't changed.
    //
    // A `null` return means no MutationManager is wired (a dev/test or
    // misconfiguration case, never production, where the provider always wires
    // it). We still update the cache so offline-cache behavior works; the scoring
    // caller separately treats `null` as a failure and surfaces it.
    //
    // deferUpload: don't let the auto-upload flush (and delete) this mutation
    // before the dirty cache row exists — otherwise, when online with slow
    // storage, the row could be written dirty AFTER its mutation was already
    // uploaded+removed, stranding it as pending forever. We trigger the upload
    // ourselves after set() below.
    const mutationId = await this.queueMutation(
      'UPDATE',
      entryId,
      supabaseRow,
      undefined,
      rpcFields ? { name: RINGSIDE_RPC_FUNCTION, fields: rpcFields } : undefined,
      /* deferUpload */ true
    );

    await this.set(entryId, updated, true);
    this.requestUpload();
    this._lastMutationId = mutationId;
    logger.log(`[${this.getTableName()}] Updated entry ${entryId}`);
    return mutationId;
  }

  /**
   * Update only the secretary lifecycle status fields.
   *
   * Entry Management still has a PostgREST read path during Wave D, so the row
   * may not be hydrated in IndexedDB yet. This method can seed the local cache
   * from the already-loaded secretary row while queueing a narrow UPDATE payload
   * so missing seed fields are not uploaded as NULL.
   */
  async updateSecretaryLifecycleStatus(
    entryId: string,
    updates: Partial<ReplicatedEntry>,
    seed: Partial<ReplicatedEntry> = {}
  ): Promise<string | null> {
    const entry = (await this.get(entryId)) ?? ({ id: entryId, ...seed } as ReplicatedEntry);
    const updated: ReplicatedEntry = {
      ...entry,
      ...updates,
      _lastModified: new Date(),
      _syncStatus: 'pending',
    };

    await this.set(entryId, updated, true);

    const payload: Record<string, unknown> = {
      id: entryId,
      entry_status: updates.entry_status ?? updates.entryStatus ?? updates.status,
      updated_at: new Date().toISOString(),
    };

    if (updates.check_in_status !== undefined || updates.checkInStatus !== undefined) {
      payload.check_in_status = updates.check_in_status ?? updates.checkInStatus;
    }

    if (updates.withdrawal_reason !== undefined || updates.withdrawalReason !== undefined) {
      payload.withdrawal_reason = updates.withdrawal_reason ?? updates.withdrawalReason;
    }

    const mutationId = await this.queueMutation('UPDATE', entryId, payload);
    this._lastMutationId = mutationId;
    logger.log(`[${this.getTableName()}] Updated entry ${entryId} secretary lifecycle status`);
    return mutationId;
  }

  async updateArmbandForDogInShow(
    showId: string,
    dogId: string,
    armband: string,
    entryIds: string[] = []
  ): Promise<{ updated: number; mutationIds: string[] }> {
    const entries = (await this.getEntriesByShow(showId)).filter(
      entry => entry.dogId === dogId && !entry.deletedAt && !entry.deleted_at
    );
    const targets = new Map<string, ReplicatedEntry | null>();
    entries.forEach(entry => targets.set(entry.id, entry));
    entryIds.forEach(entryId => {
      if (entryId && !targets.has(entryId)) {
        targets.set(entryId, null);
      }
    });

    const mutationIds: string[] = [];
    for (const [entryId, entry] of targets) {
      if (entry) {
        const updated: ReplicatedEntry = {
          ...entry,
          armband,
          armbandNumber: armband,
          _lastModified: new Date(),
          _syncStatus: 'pending',
        };

        await this.set(entryId, updated, true);
      }

      const mutationId = await this.queueMutation('UPDATE', entryId, {
        id: entryId,
        armband,
        updated_at: new Date().toISOString(),
      });
      if (mutationId) {
        mutationIds.push(mutationId);
        this._lastMutationId = mutationId;
      }
    }

    logger.log(
      `[${this.getTableName()}] Updated ${targets.size} entries for dog ${dogId} to armband ${armband}`
    );
    return { updated: targets.size, mutationIds };
  }

  /**
   * Create a new entry locally (queued for sync)
   * @param entry - Entry data (must include id)
   * @param dependsOn - Optional mutation IDs that must upload before this entry
   * The mutation ID is available via `lastMutationId` for dependency tracking.
   */
  async createEntry(
    entry: ReplicatedEntry,
    dependsOn: string | string[] = []
  ): Promise<ReplicatedEntry> {
    const newEntry: ReplicatedEntry = {
      ...entry,
      _version: 1,
      _lastModified: new Date(),
      _syncStatus: 'pending',
      _localOnly: true,
    };

    await this.set(entry.id, newEntry, true);
    const mutationId = await this.queueMutation(
      'INSERT',
      entry.id,
      entryToSupabaseRow(newEntry),
      typeof dependsOn === 'string' ? [dependsOn] : dependsOn.length > 0 ? dependsOn : undefined
    );
    this._lastMutationId = mutationId;
    logger.log(`[${this.getTableName()}] Created new entry ${entry.id}`);
    return newEntry;
  }

  /**
   * Delete an entry locally and queue DELETE mutation for Supabase sync.
   * Also marks the ID so the download sync won't resurrect it this session.
   */
  async deleteEntry(entryId: string): Promise<string | null> {
    this._deletedIds.add(entryId);
    await this.delete(entryId);
    const mutationId = await this.queueMutation('DELETE', entryId, { id: entryId });
    this._lastMutationId = mutationId;
    logger.log(`[${this.getTableName()}] Deleted entry ${entryId}`);
    return mutationId;
  }
}

// Singleton export
export const replicatedEntriesTable = new ReplicatedEntriesTable();
