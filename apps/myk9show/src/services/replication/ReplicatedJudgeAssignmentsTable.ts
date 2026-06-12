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
  type SyncReplicatedTableAdapter,
  type SyncResult,
} from '@myk9/replication';
import { logger } from '@myk9/core';
import { supabase } from '@/services/database/supabaseClient';
import { getSyncErrorMessage, isAbortSyncError } from './syncErrorUtils';
import type { Database } from '@/types/supabase';

type JudgeAssignmentRow = Database['public']['Tables']['judge_assignments']['Row'];

/**
 * Denormalized class/trial snapshot embedded at sync time. judge_assignments
 * syncs globally while classes/trials sync per-show, so the assignment row must
 * carry its own class/trial detail to drive the judge dashboard offline across
 * shows the judge hasn't entered. These are read-only enrichment fields: they
 * are NOT written back in toSupabaseRow (no such columns exist on the table).
 */
interface JudgeAssignmentEnrichment {
  className: string | null;
  classElement: string | null;
  classLevel: string | null;
  classStatus: string | null;
  classStartTime: string | null;
  classCheckedInCount: number | null;
  classScoredCount: number | null;
  classTotalEntries: number | null;
  trialDate: string | null;
  trialTimezone: string | null;
}

export interface ReplicatedJudgeAssignment extends JudgeAssignmentEnrichment {
  id: string;
  personId: string;
  showId: string | null;
  trialId: string | null;
  classId: string | null;
  status: string | null;
  invitedAt: string | null;
  confirmedAt: string | null;
  fee: number | null;
  notes: string | null;
  // Sync metadata
  _version?: number | undefined;
  _lastModified?: Date | undefined;
  _lastModifiedBy?: string | undefined;
  _syncStatus?: 'synced' | 'pending' | 'error' | 'conflict' | undefined;
  _localOnly?: boolean | undefined;
}

/** Shape returned by the enriched sync select (judge_assignments + classes + trials). */
export type JudgeAssignmentJoinedRow = JudgeAssignmentRow & {
  classes?: {
    name: string | null;
    element: string | null;
    level: string | null;
    status: string | null;
    start_time: string | null;
    scored_count: number | null;
    checked_in_count: number | null;
    total_entries_count: number | null;
    trial_id: string | null;
    trials?: {
      date: string | null;
      timezone: string | null;
      show_id: string | null;
    } | null;
  } | null;
};

const EMPTY_ENRICHMENT: JudgeAssignmentEnrichment = {
  className: null,
  classElement: null,
  classLevel: null,
  classStatus: null,
  classStartTime: null,
  classCheckedInCount: null,
  classScoredCount: null,
  classTotalEntries: null,
  trialDate: null,
  trialTimezone: null,
};

export function rowToJudgeAssignment(row: JudgeAssignmentJoinedRow): ReplicatedJudgeAssignment {
  const cls = row.classes ?? null;
  const trial = cls?.trials ?? null;
  return {
    id: String(row.id),
    personId: row.person_id,
    // Prefer the assignment's own show_id; fall back to the trial's so show-level
    // navigation still works when the assignment row predates the show_id backfill.
    showId: row.show_id ?? trial?.show_id ?? null,
    trialId: row.trial_id ?? cls?.trial_id ?? null,
    classId: row.class_id ?? null,
    status: row.status ?? null,
    invitedAt: row.invited_at ?? null,
    confirmedAt: row.confirmed_at ?? null,
    fee: row.fee ?? null,
    notes: row.notes ?? null,
    className: cls?.name ?? null,
    classElement: cls?.element ?? null,
    classLevel: cls?.level ?? null,
    classStatus: cls?.status ?? null,
    classStartTime: cls?.start_time ?? null,
    classCheckedInCount: cls?.checked_in_count ?? null,
    classScoredCount: cls?.scored_count ?? null,
    classTotalEntries: cls?.total_entries_count ?? null,
    trialDate: trial?.date ?? null,
    trialTimezone: trial?.timezone ?? null,
  };
}

export class ReplicatedJudgeAssignmentsTable extends ReplicatedTable<ReplicatedJudgeAssignment> {
  private _lastMutationId: string | null = null;

  constructor() {
    super('judge_assignments', undefined, { logger });
  }

  get lastMutationId(): string | null {
    return this._lastMutationId;
  }

  private toSupabaseRow(assignment: ReplicatedJudgeAssignment): Record<string, unknown> {
    return {
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
  }

  /**
   * Sync judge assignments from Supabase.
   * No licenseKey filter — syncs all rows (table is small).
   * No deleted_at filter — judge_assignments uses hard deletes (ON DELETE CASCADE).
   */
  async sync(_licenseKey?: string): Promise<SyncResult> {
    logger.log(`[${this.getTableName()}] Starting sync`);

    const adapter: SyncReplicatedTableAdapter<JudgeAssignmentJoinedRow, ReplicatedJudgeAssignment> =
      {
        fetchRemoteRows: async ({ since }) => {
          // Embed the class/trial snapshot so the globally-synced assignment row
          // is self-sufficient for the offline judge dashboard. To-one embeds via
          // class_id / trial_id, mirroring useJudgeTodayStats' working shape.
          const { data, error } = await supabase
            .from('judge_assignments')
            .select(
              `*, classes (
               name, element, level, status, start_time, checked_in_count, scored_count,
               total_entries_count, trial_id,
               trials ( date, timezone, show_id )
             )`
            )
            .gt('updated_at', new Date(since).toISOString())
            .order('updated_at', { ascending: true });

          if (error) {
            throw new Error(`Supabase query failed: ${error.message}`);
          }

          return (data ?? []) as unknown as JudgeAssignmentJoinedRow[];
        },
        getRemoteId: remote => String(remote.id),
        getRemoteUpdatedAt: remote => parseUpdatedAtMs(remote.updated_at),
        toLocalRow: rowToJudgeAssignment,
        resolveConflict: (_local, remote) => remote,
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
    const all = await this.getAll();
    return all.filter(a => a.showId === showId);
  }

  async getByPersonId(personId: string): Promise<ReplicatedJudgeAssignment[]> {
    const all = await this.getAll();
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
}

export const replicatedJudgeAssignmentsTable = new ReplicatedJudgeAssignmentsTable();
