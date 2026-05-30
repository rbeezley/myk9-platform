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
  type SyncReplicatedTableAdapter,
  type SyncResult,
} from '@myk9/replication';
import { logger } from '@myk9/core';
import { supabase } from '@/services/database/supabaseClient';
import { getSyncErrorMessage, isAbortSyncError } from './syncErrorUtils';
import type { Database } from '@/types/supabase';

type JudgeAssignmentRow = Database['public']['Tables']['judge_assignments']['Row'];

export interface ReplicatedJudgeAssignment {
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

function rowToJudgeAssignment(row: JudgeAssignmentRow): ReplicatedJudgeAssignment {
  return {
    id: String(row.id),
    personId: row.person_id,
    showId: row.show_id ?? null,
    trialId: row.trial_id ?? null,
    classId: row.class_id ?? null,
    status: row.status ?? null,
    invitedAt: row.invited_at ?? null,
    confirmedAt: row.confirmed_at ?? null,
    fee: row.fee ?? null,
    notes: row.notes ?? null,
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

    const adapter: SyncReplicatedTableAdapter<JudgeAssignmentRow, ReplicatedJudgeAssignment> = {
      fetchRemoteRows: async ({ since }) => {
        const { data, error } = await supabase
          .from('judge_assignments')
          .select('*')
          .gt('updated_at', new Date(since).toISOString())
          .order('updated_at', { ascending: true });

        if (error) {
          throw new Error(`Supabase query failed: ${error.message}`);
        }

        return data ?? [];
      },
      getRemoteId: remote => String(remote.id),
      toLocalRow: rowToJudgeAssignment,
      resolveConflict: (_local, remote) => remote,
    };

    const result = await syncReplicatedTable(this, adapter);

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
    assignment: Omit<ReplicatedJudgeAssignment, 'id'>
  ): Promise<ReplicatedJudgeAssignment> {
    const id = crypto.randomUUID();
    const newAssignment: ReplicatedJudgeAssignment = {
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
