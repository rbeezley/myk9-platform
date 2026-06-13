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
import { rowToEntry, type EntryRow, type ReplicatedEntry } from './ReplicatedEntriesTable.mapper';

export { rowToEntry };
export type { ReplicatedEntry };

export class ReplicatedEntriesTable extends ReplicatedTable<ReplicatedEntry> {
  /** Most recent mutation ID from a create/update operation */
  private _lastMutationId: string | null = null;

  /**
   * IDs deleted locally this session. The download sync skips these
   * so it doesn't resurrect entries the user just deleted.
   */
  private _deletedIds: Set<string> = new Set();

  constructor() {
    super('entries', undefined, { logger });
  }

  /** Get the mutation ID from the last create/update operation */
  get lastMutationId(): string | null {
    return this._lastMutationId;
  }

  /**
   * Convert app-level Entry to Supabase row format (snake_case).
   * Only maps fields that exist as actual DB columns. Strips sync metadata
   * and app-only display fields (dogCallName, handlerName, etc.).
   */
  private toSupabaseRow(entry: ReplicatedEntry): Record<string, unknown> {
    // Coerce empty strings to null for UUID FK columns (Postgres rejects '' as invalid UUID)
    const fk = (v: string | undefined): string | null => v || null;

    return {
      id: entry.id,
      class_id: fk(entry.classId),
      show_id: fk(entry.showId),
      dog_id: fk(entry.dogId),
      handler_id: fk(entry.handlerId),
      armband: entry.armband ?? null,
      handler: entry.handler ?? null,
      entry_status: entry.entryStatus ?? null,
      check_in_status: entry.checkInStatus ?? entry.check_in_status ?? 'no-status',
      jump_height: entry.jumpHeight ?? null,
      entry_fee: entry.entryFee ?? null,
      payment_status: entry.paymentStatus ?? null,
      payment_method: entry.paymentMethod ?? null,
      entry_source: entry.entrySource ?? 'myk9',
      is_day_of_show: entry.isDayOfShow ?? null,
      run_order: entry.runOrder ?? null,
      move_up_requested: entry.moveUpRequested ?? entry.move_up_requested ?? null,
      preferred_judge: entry.preferredJudge ?? null,
      special_requests:
        entry.specialRequests !== undefined
          ? entry.specialRequests
          : entry.special_requests !== undefined
            ? entry.special_requests
            : null,
      withdrawal_reason:
        entry.withdrawalReason !== undefined
          ? entry.withdrawalReason
          : entry.withdrawal_reason !== undefined
            ? entry.withdrawal_reason
            : null,
      submitted_at: entry.submittedAt ?? null,
      registration_id: fk(entry.registrationId),
      trial_id: fk(entry.trialId ?? entry.trial_id),
      is_scored: entry.isScored ?? entry.is_scored ?? null,
      result_status: entry.resultStatus ?? entry.result_status ?? null,
      disqualification_reason: entry.disqualification_reason ?? null,
      search_time_seconds: entry.searchTimeSeconds ?? entry.search_time_seconds ?? null,
      total_score: entry.totalPoints ?? entry.total_points ?? null,
      total_faults: entry.totalFaults ?? entry.total_faults ?? null,
      judge_notes: entry.judgeNotes ?? entry.judge_notes ?? null,
      scoring_completed_at: entry.scoringCompletedAt ?? entry.scoring_completed_at ?? null,
      // Only write placement if result is qualified — NQ/absent/etc. should never have a placement
      final_placement:
        entry.resultStatus && entry.resultStatus !== 'qualified'
          ? null
          : entry.finalPlacement != null
            ? Number(entry.finalPlacement)
            : entry.final_placement != null
              ? Number(entry.final_placement)
              : null,
      ring_entry_time: entry.ring_entry_time ?? null,
      ring_exit_time: entry.ring_exit_time ?? null,
      deleted_at:
        entry.deletedAt !== undefined
          ? entry.deletedAt
          : entry.deleted_at !== undefined
            ? entry.deleted_at
            : null,
      updated_at: new Date().toISOString(),
    };
  }

  async sync(licenseKey: string): Promise<SyncResult> {
    logger.log(`[${this.getTableName()}] Starting sync`);

    const adapter: SyncReplicatedTableAdapter<EntryRow, ReplicatedEntry> = {
      fetchRemoteRows: async ({ scope, since }) => {
        // Filter by show_id if provided. In myK9Show this scope value is the Show ID.
        // Embed the dog's display fields (call_name/breed) so entry cards can
        // show the dog without a separate per-row dogs lookup. `entries.dog_id`
        // is a to-one FK, so `dogs(...)` returns a single object. These land on
        // the replica as `dog_call_name` / `dog_breed` (see rowToEntry).
        let query = supabase
          .from('entries')
          .select('*, dogs(call_name, breed)')
          .gt('updated_at', new Date(since).toISOString())
          .order('updated_at', { ascending: true });

        if (scope.value) {
          query = query.eq('show_id', scope.value);
        }

        const { data, error } = await query;

        if (error) {
          throw new Error(`Supabase query failed: ${error.message}`);
        }

        return data ?? [];
      },
      getRemoteId: remote => {
        return String(remote.id);
      },
      getRemoteUpdatedAt: remote => parseUpdatedAtMs(remote.updated_at),
      toLocalRow: rowToEntry,
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
      { value: licenseKey },
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
   * Update entry status (offline-first)
   * @returns mutation ID if queued, null if no MutationManager
   */
  async updateEntryStatus(entryId: string, status: string): Promise<string | null> {
    const entry = await this.get(entryId);
    if (!entry) {
      throw new Error(`Entry ${entryId} not found`);
    }

    const updated: ReplicatedEntry = {
      ...entry,
      status,
      entryStatus: status,
      entry_status: status,
      _lastModified: new Date(),
      _syncStatus: 'pending',
    };

    await this.set(entryId, updated, true);
    const mutationId = await this.queueMutation('UPDATE', entryId, this.toSupabaseRow(updated));
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
    const entry = await this.get(entryId);
    if (!entry) {
      throw new Error(`Entry ${entryId} not found`);
    }

    const updated: ReplicatedEntry = {
      ...entry,
      checkInStatus: status,
      check_in_status: status,
      _lastModified: new Date(),
      _syncStatus: 'pending',
    };

    await this.set(entryId, updated, true);
    const mutationId = await this.queueMutation('UPDATE', entryId, {
      id: entryId,
      check_in_status: status,
      updated_at: new Date().toISOString(),
    });
    this._lastMutationId = mutationId;
    logger.log(`[${this.getTableName()}] Updated entry ${entryId} check-in status to ${status}`);
    return mutationId;
  }

  /**
   * Update entry (marks as dirty for sync)
   * @returns mutation ID if queued, null if no MutationManager
   */
  async updateEntry(entryId: string, updates: Partial<ReplicatedEntry>): Promise<string | null> {
    const entry = await this.get(entryId);
    if (!entry) {
      throw new Error(`Entry ${entryId} not found`);
    }

    const updated: ReplicatedEntry = {
      ...entry,
      ...updates,
      _lastModified: new Date(),
      _syncStatus: 'pending',
    };

    await this.set(entryId, updated, true);
    const mutationId = await this.queueMutation('UPDATE', entryId, this.toSupabaseRow(updated));
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
    armband: string
  ): Promise<{ updated: number; mutationIds: string[] }> {
    const entries = (await this.getEntriesByShow(showId)).filter(
      entry =>
        entry.dogId === dogId &&
        !entry.deletedAt &&
        !entry.deleted_at
    );

    const mutationIds: string[] = [];
    for (const entry of entries) {
      const updated: ReplicatedEntry = {
        ...entry,
        armband,
        armbandNumber: armband,
        _lastModified: new Date(),
        _syncStatus: 'pending',
      };

      await this.set(entry.id, updated, true);
      const mutationId = await this.queueMutation('UPDATE', entry.id, {
        id: entry.id,
        armband,
        updated_at: new Date().toISOString(),
      });
      if (mutationId) {
        mutationIds.push(mutationId);
      }
      this._lastMutationId = mutationId;
    }

    logger.log(
      `[${this.getTableName()}] Updated ${entries.length} entries for dog ${dogId} to armband ${armband}`
    );
    return { updated: entries.length, mutationIds };
  }

  /**
   * Create a new entry locally (queued for sync)
   * @param entry - Entry data (must include id)
   * @param classMutationId - Optional mutation ID of the parent class (for dependency tracking)
   * The mutation ID is available via `lastMutationId` for dependency tracking.
   */
  async createEntry(entry: ReplicatedEntry, classMutationId?: string): Promise<ReplicatedEntry> {
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
      this.toSupabaseRow(newEntry),
      classMutationId ? [classMutationId] : undefined
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
