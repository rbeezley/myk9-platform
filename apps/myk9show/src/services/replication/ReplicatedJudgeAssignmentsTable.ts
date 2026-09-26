/**
 * ReplicatedJudgeAssignmentsTable - Offline-first judge assignment data replication
 *
 * Manages judge-to-show/trial/class assignment data with offline support.
 * Used by showStore to populate assignedJudges on each show.
 *
 * Conflict Resolution: Server-authoritative
 */

import {
  ReplicatedTable,
  syncReplicatedTable,
  parseUpdatedAtMs,
  REPLICATION_INCREMENTAL_BUFFER_MS,
  type RowRefetchAdapter,
  type SyncReplicatedTableAdapter,
  type SyncResult,
} from '@myk9/replication';
import { logger } from '@myk9/core';
import { supabase } from '@/services/database/supabaseClient';
import { getSyncErrorMessage, isAbortSyncError } from './syncErrorUtils';

import {
  EMPTY_ENRICHMENT,
  rowToJudgeAssignment,
  type JudgeAssignmentEnrichment,
  type JudgeAssignmentJoinedRow,
  type ReplicatedJudgeAssignment,
} from './ReplicatedJudgeAssignmentsTable.mapper';

export { rowToJudgeAssignment };
export type { JudgeAssignmentJoinedRow, ReplicatedJudgeAssignment };

/**
 * The enriched select every judge_assignments read uses (sync and the MYK9-771
 * single-row re-fetch): the assignment plus its class/trial snapshot. Named
 * columns only: fee and notes are private (MYK9-146).
 */
export const JUDGE_ASSIGNMENT_SELECT = `id, person_id, show_id, trial_id, class_id, status,
               invited_at, confirmed_at, created_at, updated_at,
               day_capacity_override, version,
               classes (
               name, element, level, status, start_time, checked_in_count, scored_count,
               total_entries_count, trial_id,
               trials ( date, timezone, show_id )
             )`;

/** PostgREST's max_rows (supabase/config.toml): one page of the sync fetch. */
export const JUDGE_ASSIGNMENTS_PAGE_SIZE = 1000;

export class ReplicatedJudgeAssignmentsTable extends ReplicatedTable<ReplicatedJudgeAssignment> {
  private _lastMutationId: string | null = null;

  constructor() {
    super('judge_assignments', { logger });
  }

  get lastMutationId(): string | null {
    return this._lastMutationId;
  }

  /**
   * Do not return private assignment fields from the offline cache. Existing
   * IndexedDB rows may predate MYK9-146 and still contain fee/notes; redacting
   * at the public collection boundary prevents those stale values from
   * reaching ordinary show/judge views while the next sync replaces them.
   * Every collection read applies this, the show read included (MYK9-788).
   * `get()` remains raw for mutation merge payloads so an office update cannot
   * accidentally overwrite a fee or note it did not edit.
   */
  protected override presentRows(rows: ReplicatedJudgeAssignment[]): ReplicatedJudgeAssignment[] {
    return rows.map(row => ({ ...row, fee: null, notes: null }));
  }

  private toSupabaseRow(assignment: ReplicatedJudgeAssignment): Record<string, unknown> {
    const row: Record<string, unknown> = {
      id: assignment.id,
      person_id: assignment.personId,
      show_id: assignment.showId ?? null,
      trial_id: assignment.trialId ?? null,
      class_id: assignment.classId ?? null,
      status: assignment.status ?? null,
      invited_at: assignment.invitedAt ?? null,
      confirmed_at: assignment.confirmedAt ?? null,
      fee: assignment.fee ?? null,
      notes: assignment.notes ?? null,
      updated_at: new Date().toISOString(),
    };

    // Rows cached in IndexedDB before this field existed have
    // dayCapacityOverride === undefined ("no value"). Omit the key in that
    // case so an unrelated update doesn't silently clear a server-side
    // override; a deliberate clear sets the field to explicit null, which
    // IS sent through.
    if (assignment.dayCapacityOverride !== undefined) {
      row.day_capacity_override = assignment.dayCapacityOverride;
    }

    return row;
  }

  protected override rebuildUpdatePayload(
    assignment: ReplicatedJudgeAssignment
  ): Record<string, unknown> {
    return this.toSupabaseRow(assignment);
  }

  /**
   * Reads rows by id the way `sync` does, so a full-row UPDATE rejected for a
   * stale OCC token can re-fetch its row and rebase or surface (MYK9-771).
   */
  protected override getRowRefetchAdapter(): RowRefetchAdapter<
    JudgeAssignmentJoinedRow,
    ReplicatedJudgeAssignment
  > {
    return {
      fetchRowsById: async ids => {
        const { data, error } = await supabase
          .from('judge_assignments')
          .select(JUDGE_ASSIGNMENT_SELECT)
          .in('id', ids);
        if (error) throw new Error(`Supabase query failed: ${error.message}`);
        return (data ?? []) as unknown as JudgeAssignmentJoinedRow[];
      },
      getRemoteId: remote => String(remote.id),
      toLocalRow: rowToJudgeAssignment,
      rebuildUpdatePayload: assignment => this.toSupabaseRow(assignment),
    };
  }

  /**
   * Sync judge assignments from Supabase.
   * No sync scope filter — syncs all rows (table is small).
   * No deleted_at filter — judge_assignments uses hard deletes (ON DELETE CASCADE).
   */
  async sync(_syncScopeId?: string): Promise<SyncResult> {
    logger.log(`[${this.getTableName()}] Starting sync`);

    const adapter: SyncReplicatedTableAdapter<JudgeAssignmentJoinedRow, ReplicatedJudgeAssignment> =
      {
        ...this.getRowRefetchAdapter(),
        getRemoteRowCount: async () => {
          try {
            const { count, error } = await supabase
              .from('judge_assignments')
              .select('id', { count: 'exact', head: true });

            if (error) {
              logger.warn(
                `[${this.getTableName()}] Judge assignment coverage count unavailable; continuing sync`,
                'replication',
                { message: error.message }
              );
              return undefined;
            }

            return count ?? 0;
          } catch (error) {
            logger.warn(
              `[${this.getTableName()}] Judge assignment coverage count unavailable; continuing sync`,
              'replication',
              { message: error instanceof Error ? error.message : String(error) }
            );
            return undefined;
          }
        },
        fetchRemoteRows: async ({ since }) => {
          // Embed the class/trial snapshot so the globally-synced assignment row
          // is self-sufficient for the offline judge dashboard. To-one embeds via
          // class_id / trial_id, mirroring useJudgeTodayStats' working shape.
          //
          // Paged by keyset on (updated_at, id), as the entries sync is:
          // PostgREST caps a response at max_rows, and the stale-row cleanup
          // only runs after a fetch that returned the whole server count
          // (MYK9-775, MYK9-776).
          const rows: JudgeAssignmentJoinedRow[] = [];
          let cursorUpdatedAt: string | null = null;
          let cursorId: string | null = null;
          for (;;) {
            let query = supabase.from('judge_assignments').select(JUDGE_ASSIGNMENT_SELECT);
            query =
              cursorUpdatedAt && cursorId
                ? query.or(
                    `updated_at.gt.${cursorUpdatedAt},and(updated_at.eq.${cursorUpdatedAt},id.gt.${cursorId})`
                  )
                : query.gt('updated_at', new Date(since).toISOString());
            const { data, error } = await query
              .order('updated_at', { ascending: true })
              .order('id', { ascending: true })
              .range(0, JUDGE_ASSIGNMENTS_PAGE_SIZE - 1);

            if (error) {
              throw new Error(`Supabase query failed: ${error.message}`);
            }

            const page = (data ?? []) as unknown as JudgeAssignmentJoinedRow[];
            rows.push(...page);
            if (page.length < JUDGE_ASSIGNMENTS_PAGE_SIZE) return rows;
            const last = page[page.length - 1];
            if (!last?.updated_at || !last.id) return rows;
            cursorUpdatedAt = String(last.updated_at);
            cursorId = String(last.id);
          }
        },
        getRemoteUpdatedAt: remote => parseUpdatedAtMs(remote.updated_at),
        resolveConflict: (_local, remote) => remote,
        // Assignments are HARD-deleted and the incremental fetch can never see a
        // deletion, so a removed judge stayed on every other device forever
        // (MYK9-775). The fetch above has no scope filter, so a complete full
        // fetch returns every row THIS session may read, and a full sync
        // removes what it no longer returns. On a device shared between
        // accounts that includes rows only the previous account could read.
        // The engine skips the cleanup unless the fetch returned the whole
        // server count (the fetch is not paged; PostgREST caps it at max_rows).
        cleanupStaleRowsOnFullSync: true,
      };

    const result = await syncReplicatedTable(
      this,
      adapter,
      {},
      {
        incrementalBufferMs: REPLICATION_INCREMENTAL_BUFFER_MS,
      }
    );

    if (!result.success && result.error && !isAbortSyncError(result.error)) {
      logger.error(`[${this.getTableName()}] Sync failed:`, result.error);
      return { ...result, error: getSyncErrorMessage(result.error) };
    }

    return result;
  }

  protected resolveConflict(
    _local: ReplicatedJudgeAssignment,
    remote: ReplicatedJudgeAssignment
  ): ReplicatedJudgeAssignment {
    return remote;
  }

  async getByShowId(showId: string): Promise<ReplicatedJudgeAssignment[]> {
    const all = await this.getAllOrThrow();
    return all.filter(a => a.showId === showId);
  }

  async getByPersonId(personId: string): Promise<ReplicatedJudgeAssignment[]> {
    const all = await this.getAllOrThrow();
    return all.filter(a => a.personId === personId);
  }

  async createAssignment(
    assignment: Omit<ReplicatedJudgeAssignment, 'id' | keyof JudgeAssignmentEnrichment> &
      Partial<JudgeAssignmentEnrichment>
  ): Promise<ReplicatedJudgeAssignment> {
    const id = crypto.randomUUID();
    const newAssignment: ReplicatedJudgeAssignment = {
      // Enrichment is server-derived; a fresh local row carries nulls until the
      // next sync re-fetches it with the embedded class/trial snapshot.
      ...EMPTY_ENRICHMENT,
      ...assignment,
      id,
      _version: 1,
      _lastModified: new Date(),
      _syncStatus: 'pending',
      _localOnly: true,
    };

    await this.set(id, newAssignment, true);
    const mutationId = await this.queueMutation('INSERT', id, this.toSupabaseRow(newAssignment));
    this._lastMutationId = mutationId;
    logger.log(`[${this.getTableName()}] Created assignment ${id}`);
    return newAssignment;
  }

  async updateAssignment(
    id: string,
    updates: Partial<ReplicatedJudgeAssignment>
  ): Promise<string | null> {
    const current = await this.get(id);
    if (!current) {
      throw new Error(`Judge assignment ${id} not found`);
    }

    const updated: ReplicatedJudgeAssignment = {
      ...current,
      ...updates,
      _lastModified: new Date(),
      _syncStatus: 'pending',
    };

    await this.set(id, updated, true);
    const mutationId = await this.queueMutation('UPDATE', id, this.toSupabaseRow(updated));
    this._lastMutationId = mutationId;
    logger.log(`[${this.getTableName()}] Updated assignment ${id}`);
    return mutationId;
  }

  async deleteAssignment(id: string): Promise<string | null> {
    await this.delete(id);
    const mutationId = await this.queueMutation('DELETE', id, { id });
    this._lastMutationId = mutationId;
    logger.log(`[${this.getTableName()}] Deleted assignment ${id}`);
    return mutationId;
  }

  /**
   * Every assignment on this device, for a WRITE that is built on what exists.
   * getAll()/getByShowId() read a failed device read as [], and a write built
   * on that adds a duplicate judge or reports a no-op success. Throw instead so
   * the save fails visibly (MYK9-769).
   */
  private async readAllForWrite(): Promise<ReplicatedJudgeAssignment[]> {
    const read = await this.getAllWithStatus();
    if (!read.ok) {
      throw new Error(
        `Could not read this show's judge assignments on this device; nothing was changed: ${String(read.error)}`
      );
    }
    return read.rows;
  }

  /**
   * Apply a secretary's show-level judge edit as a DIFFERENCE: create a
   * show-level (class_id null) assignment for each judge in `add` that lacks
   * one, and delete the show-level rows of each judge in `remove`. Judges in
   * neither list are untouched, so an unchanged save writes nothing.
   *
   * Never "replace all": the list a form was loaded from can be empty because
   * a device read failed, and replace-all then deleted every real judge the
   * secretary never saw (MYK9-772). A judge can only be removed by being named
   * in `remove`, i.e. seen and taken off the list.
   */
  async applyShowLevelJudgeChanges(
    showId: string,
    changes: { add: readonly string[]; remove: readonly string[] }
  ): Promise<void> {
    if (changes.add.length === 0 && changes.remove.length === 0) return;
    const showLevel = (await this.readAllForWrite()).filter(
      a => a.showId === showId && a.classId === null
    );
    const removing = new Set(changes.remove);
    for (const row of showLevel) {
      if (removing.has(row.personId)) await this.deleteAssignment(row.id);
    }
    const alreadyShowLevel = new Set(showLevel.map(a => a.personId));
    for (const personId of changes.add) {
      if (alreadyShowLevel.has(personId)) continue;
      await this.createAssignment({
        personId,
        showId,
        trialId: null,
        classId: null,
        status: 'confirmed',
        invitedAt: null,
        confirmedAt: new Date().toISOString(),
        fee: null,
        notes: null,
      });
    }
  }

  /**
   * Replace the assignment for a single class: deletes any existing class-level
   * assignment(s), then creates a new one unless `judgeId` is null (removal).
   * Mirrors `upsertClassJudgeAssignment`'s delete-then-insert semantics.
   */
  async replaceClassAssignment(
    showId: string,
    classId: string,
    judgeId: string | null
  ): Promise<void> {
    const existing = (await this.readAllForWrite()).filter(a => a.classId === classId);
    for (const row of existing) {
      await this.deleteAssignment(row.id);
    }
    if (judgeId) {
      await this.createAssignment({
        personId: judgeId,
        showId,
        trialId: null,
        classId,
        status: 'confirmed',
        invitedAt: null,
        confirmedAt: new Date().toISOString(),
        fee: null,
        notes: null,
      });
    }
  }

  /**
   * Reassign a class's judge in place (update, not delete+insert) to preserve the
   * assignment's identity/history. No-ops if no local row matches the from/class/show
   * filter, mirroring the raw `.eq()` update's silent no-match behavior.
   */
  async reassignClassAssignment(
    showId: string,
    classId: string,
    fromPersonId: string,
    toPersonId: string
  ): Promise<void> {
    const all = await this.readAllForWrite();
    const match = all.find(
      a => a.classId === classId && a.showId === showId && a.personId === fromPersonId
    );
    if (!match) return;
    await this.updateAssignment(match.id, { personId: toPersonId });
  }
}

export const replicatedJudgeAssignmentsTable = new ReplicatedJudgeAssignmentsTable();
