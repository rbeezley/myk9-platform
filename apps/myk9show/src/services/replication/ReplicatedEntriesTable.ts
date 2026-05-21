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
  type SyncReplicatedTableAdapter,
  type SyncResult,
} from '@myk9/replication';
import { logger } from '@myk9/core';
import type { CheckInStatus } from '@myk9/core';
import { supabase } from '@/services/database/supabaseClient';
import { getSyncErrorMessage, isAbortSyncError } from './syncErrorUtils';
import type { Database } from '@/types/supabase';

/**
 * Database row type from Supabase schema
 */
type EntryRow = Database['public']['Tables']['entries']['Row'];

/**
 * App-level Entry type with camelCase fields and sync metadata
 */
export interface ReplicatedEntry {
  id: string;
  classId?: string | undefined;
  showId?: string | undefined;
  dogId?: string | undefined;
  handlerId?: string | undefined;
  armband?: string | undefined;
  handler?: string | undefined;
  status?: string | undefined;
  entryStatus?: string | undefined;

  // Check-in status (show-day flow, separate from entry_status lifecycle)
  checkInStatus?: CheckInStatus | undefined;
  check_in_status?: CheckInStatus | undefined; // snake_case alias for Supabase compatibility

  jumpHeight?: string | undefined;
  entryFee?: number | undefined;
  totalFees?: number | undefined;
  paymentStatus?: string | undefined;
  paymentMethod?: string | undefined;
  entrySource?: string | undefined;
  isDayOfShow?: boolean | undefined;
  runOrder?: number | undefined;
  moveUpRequested?: boolean | undefined;
  preferredJudge?: string | undefined;
  specialRequests?: string | undefined;
  submittedAt?: string | undefined;
  registrationId?: string | undefined;

  // Extra fields for scoring/display (camelCase)
  isScored?: boolean | undefined;
  resultStatus?: string | undefined;
  resultText?: string | undefined;
  searchTimeSeconds?: number | undefined;
  totalPoints?: number | undefined;
  finalPlacement?: string | null | undefined;
  dogCallName?: string | undefined;
  dogBreed?: string | undefined;
  handlerName?: string | undefined;
  armbandNumber?: string | undefined;

  disqualification_reason?: string | null | undefined;
  totalFaults?: number | undefined;
  judgeNotes?: string | null | undefined;
  scoringCompletedAt?: string | null | undefined;

  // Extra fields for scoring/display (snake_case for Compatibility)
  is_scored?: boolean | undefined;
  result_status?: string | undefined;
  result_text?: string | undefined;
  search_time_seconds?: number | undefined;
  total_points?: number | undefined;
  final_placement?: string | undefined;
  dog_call_name?: string | undefined;
  dog_breed?: string | undefined;
  handler_name?: string | undefined;
  armband_number?: string | undefined;
  total_faults?: number | undefined;
  judge_notes?: string | null | undefined;
  scoring_completed_at?: string | null | undefined;
  class_id?: string | undefined;
  entry_status?: string | undefined;
  element?: string | undefined;
  level?: string | undefined;
  areas?: number | undefined;
  timeLimit?: string | undefined;
  timeLimit2?: string | undefined;
  timeLimit3?: string | undefined;

  // Ring timing (show-day flow)
  ring_entry_time?: string | undefined;
  ring_exit_time?: string | undefined;

  // Timestamps
  updated_at?: string | undefined;

  // Sync metadata
  _version?: number | undefined;
  _lastModified?: Date | undefined;
  _lastModifiedBy?: string | undefined;
  _syncStatus?: 'synced' | 'pending' | 'error' | 'conflict' | undefined;
  _localOnly?: boolean | undefined;
}

/**
 * Convert database row to app Entry type
 */
function rowToEntry(row: EntryRow): ReplicatedEntry {
  // Cast to Record for accessing fields not in the Supabase schema type
  const dbRow = row as EntryRow & Record<string, unknown>;
  return {
    id: String(row.id),
    classId: row.class_id ?? undefined,
    showId: row.show_id ?? undefined,
    dogId: row.dog_id ?? undefined,
    handlerId: row.handler_id ?? undefined,
    armband: row.armband ?? undefined,
    handler: row.handler ?? undefined,
    status: (dbRow.status as string | undefined) ?? undefined,
    entryStatus: row.entry_status ?? undefined,
    checkInStatus: (dbRow.check_in_status as CheckInStatus) ?? 'no-status',
    check_in_status: (dbRow.check_in_status as CheckInStatus) ?? 'no-status',
    jumpHeight: row.jump_height ?? undefined,
    entryFee: row.entry_fee ?? undefined,
    totalFees: (dbRow.total_fees as number | undefined) ?? undefined,
    paymentStatus: row.payment_status ?? undefined,
    paymentMethod: (dbRow.payment_method as string | undefined) ?? undefined,
    entrySource: (dbRow.entry_source as string | undefined) ?? undefined,
    isDayOfShow: row.is_day_of_show ?? undefined,
    runOrder: row.run_order ?? undefined,
    moveUpRequested: row.move_up_requested ?? undefined,
    preferredJudge: row.preferred_judge ?? undefined,
    specialRequests: row.special_requests ?? undefined,
    submittedAt: row.submitted_at ?? undefined,
    registrationId: (dbRow.registration_id as string | undefined) ?? undefined,

    // CamelCase fields
    disqualification_reason: (dbRow.disqualification_reason as string | undefined) ?? undefined,
    totalFaults: (dbRow.total_faults as number | undefined) ?? undefined,
    judgeNotes: (dbRow.judge_notes as string | undefined) ?? undefined,
    scoringCompletedAt: (dbRow.scoring_completed_at as string | undefined) ?? undefined,
    isScored: (dbRow.is_scored as boolean | undefined) ?? false,
    resultStatus: (dbRow.result_status as string | undefined) ?? undefined,
    resultText: (dbRow.result_text as string | undefined) ?? undefined,
    searchTimeSeconds: (dbRow.search_time_seconds as number | undefined) ?? undefined,
    totalPoints: (dbRow.total_points as number | undefined) ?? undefined,
    finalPlacement: dbRow.final_placement != null ? String(dbRow.final_placement) : undefined,
    dogCallName: (dbRow.dog_call_name as string | undefined) ?? undefined,
    dogBreed: (dbRow.dog_breed as string | undefined) ?? undefined,
    handlerName: row.handler ?? undefined,
    armbandNumber: row.armband ?? undefined,

    // Snake_case fields (compatibility)
    is_scored: (dbRow.is_scored as boolean | undefined) ?? false,
    result_status: (dbRow.result_status as string | undefined) ?? undefined,
    result_text: (dbRow.result_text as string | undefined) ?? undefined,
    search_time_seconds: (dbRow.search_time_seconds as number | undefined) ?? undefined,
    total_points: (dbRow.total_points as number | undefined) ?? undefined,
    final_placement: dbRow.final_placement != null ? String(dbRow.final_placement) : undefined,
    dog_call_name: (dbRow.dog_call_name as string | undefined) ?? undefined,
    dog_breed: (dbRow.dog_breed as string | undefined) ?? undefined,
    handler_name: row.handler ?? undefined,
    armband_number: row.armband ?? undefined,
    total_faults: (dbRow.total_faults as number | undefined) ?? undefined,
    judge_notes: (dbRow.judge_notes as string | undefined) ?? undefined,
    scoring_completed_at: (dbRow.scoring_completed_at as string | undefined) ?? undefined,
    class_id: row.class_id ?? undefined,
    entry_status: row.entry_status ?? undefined,
    element: (dbRow.element as string | undefined) ?? undefined,
    level: (dbRow.level as string | undefined) ?? undefined,
    areas: (dbRow.area_count as number | undefined) ?? undefined,
    timeLimit: dbRow.time_limit_seconds ? String(dbRow.time_limit_seconds as number) : undefined,
    timeLimit2: dbRow.time_limit_area2_seconds
      ? String(dbRow.time_limit_area2_seconds as number)
      : undefined,
    timeLimit3: dbRow.time_limit_area3_seconds
      ? String(dbRow.time_limit_area3_seconds as number)
      : undefined,

    // Ring timing
    ring_entry_time: (row.ring_entry_time as string | undefined) ?? undefined,
    ring_exit_time: (row.ring_exit_time as string | undefined) ?? undefined,

    // Timestamps
    updated_at: row.updated_at ?? undefined,
  };
}

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
      move_up_requested: entry.moveUpRequested ?? null,
      preferred_judge: entry.preferredJudge ?? null,
      special_requests: entry.specialRequests ?? null,
      submitted_at: entry.submittedAt ?? null,
      registration_id: fk(entry.registrationId),
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
      updated_at: new Date().toISOString(),
    };
  }

  async sync(licenseKey: string): Promise<SyncResult> {
    logger.log(`[${this.getTableName()}] Starting sync`);

    const adapter: SyncReplicatedTableAdapter<EntryRow, ReplicatedEntry> = {
      fetchRemoteRows: async ({ scope, since }) => {
        // Filter by show_id if provided. In myK9Show this scope value is the Show ID.
        let query = supabase
          .from('entries')
          .select('*')
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

    const result = await syncReplicatedTable(this, adapter, { value: licenseKey });

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
