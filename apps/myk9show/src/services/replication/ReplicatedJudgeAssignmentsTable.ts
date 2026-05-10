/**
 * ReplicatedJudgeAssignmentsTable - Offline-first judge assignment data replication
 *
 * Manages judge-to-show/trial/class assignment data with offline support.
 * Used by showStore to populate assignedJudges on each show.
 *
 * Conflict Resolution: Server-authoritative
 */

import { ReplicatedTable, type SyncResult } from '@myk9/replication';
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
    const startTime = Date.now();
    let rowsSynced = 0;
    let conflictsResolved = 0;

    try {
      const metadata = await this.getSyncMetadata();
      const allCached = await this.getAll();
      const isCacheEmpty = allCached.length === 0;
      const lastSync = isCacheEmpty ? 0 : metadata?.lastIncrementalSyncAt || 0;

      logger.log(
        `[${this.getTableName()}] Starting ${isCacheEmpty ? 'FULL (empty cache)' : 'incremental'} sync (since ${new Date(lastSync).toISOString()}), cache: ${allCached.length} assignments`
      );

      const { data: remoteRows, error } = await supabase
        .from('judge_assignments')
        .select('*')
        .gt('updated_at', new Date(lastSync).toISOString())
        .order('updated_at', { ascending: true });

      if (error) {
        throw new Error(`Supabase query failed: ${error.message}`);
      }

      if (!remoteRows || remoteRows.length === 0) {
        await this.updateSyncMetadata({
          lastIncrementalSyncAt: Date.now(),
          syncStatus: 'idle',
        });

        return {
          tableName: this.getTableName(),
          success: true,
          operation: 'incremental-sync',
          rowsAffected: 0,
          conflictsResolved: 0,
          duration: Date.now() - startTime,
        };
      }

      // Build lookup from already-fetched cache to avoid N individual IDB reads
      const localCache = new Map(allCached.map(a => [a.id, a]));

      for (const remoteRow of remoteRows) {
        const assignmentId = String(remoteRow.id);
        const remoteAssignment = rowToJudgeAssignment(remoteRow);
        const localAssignment = localCache.get(assignmentId) ?? null;

        if (localAssignment) {
          const resolved = this.resolveConflict(localAssignment, remoteAssignment);
          await this.set(assignmentId, resolved);
          conflictsResolved++;
        } else {
          await this.set(assignmentId, remoteAssignment);
        }

        rowsSynced++;
      }

      await this.updateSyncMetadata({
        lastIncrementalSyncAt: Date.now(),
        syncStatus: 'idle',
      });

      const duration = Date.now() - startTime;
      logger.log(
        `[${this.getTableName()}] Sync complete: ${rowsSynced} rows, ${conflictsResolved} conflicts, ${duration}ms`
      );

      return {
        tableName: this.getTableName(),
        success: true,
        operation: 'incremental-sync',
        rowsAffected: rowsSynced,
        conflictsResolved,
        duration,
      };
    } catch (error) {
      const errorMessage = getSyncErrorMessage(error);

      await this.updateSyncMetadata({
        syncStatus: 'error',
        errorMessage,
      });

      if (!isAbortSyncError(error)) {
        logger.error(`[${this.getTableName()}] Sync failed:`, error);
      }

      return {
        tableName: this.getTableName(),
        success: false,
        operation: 'incremental-sync',
        rowsAffected: rowsSynced,
        conflictsResolved,
        duration: Date.now() - startTime,
        error: errorMessage,
      };
    }
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
