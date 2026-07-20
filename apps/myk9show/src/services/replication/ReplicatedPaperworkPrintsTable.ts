import {
  REPLICATION_INCREMENTAL_BUFFER_MS,
  ReplicatedTable,
  parseUpdatedAtMs,
  syncReplicatedTable,
  type SyncReplicatedTableAdapter,
  type SyncResult,
} from '@myk9/replication';
import { logger } from '@myk9/core';

import { supabase } from '@/services/database/supabaseClient';
import type { ReportScope } from '@/lib/reports/types';

import { getSyncErrorMessage, isAbortSyncError } from './syncErrorUtils';

type PaperworkPrintScopeKind = ReportScope['kind'];

interface PaperworkPrintRow {
  id: string;
  show_id: string;
  trial_id: string | null;
  class_id: string | null;
  scope_kind: PaperworkPrintScopeKind;
  report_id: string;
  coverage: Record<string, unknown>;
  fingerprint: string;
  printed_by: string;
  printed_by_name: string;
  printed_at: string;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface ReplicatedPaperworkPrint {
  id: string;
  showId: string;
  trialId?: string | undefined;
  classId?: string | undefined;
  scopeKind: PaperworkPrintScopeKind;
  reportId: string;
  coverage: Record<string, unknown>;
  fingerprint: string;
  printedBy: string;
  printedByName: string;
  printedAt: string;
  voidedAt?: string | undefined;
  voidedBy?: string | undefined;
  voidReason?: string | undefined;
  createdAt?: string | undefined;
  updatedAt?: string | undefined;
  _version?: number | undefined;
  _lastModified?: Date | undefined;
  _syncStatus?: 'synced' | 'pending' | 'error' | 'conflict' | undefined;
  _localOnly?: boolean | undefined;
}

export interface ConfirmPaperworkPrintInput {
  id?: string | undefined;
  scope: ReportScope;
  reportId: string;
  coverage: Record<string, unknown>;
  fingerprint: string;
  printedBy: string;
  printedByName: string;
  printedAt?: string | undefined;
}

interface PaperworkPrintQuery {
  select(columns: string): PaperworkPrintQuery;
  eq(column: string, value: string): PaperworkPrintQuery;
  gt(column: string, value: string): PaperworkPrintQuery;
  order(
    column: string,
    options: { ascending: boolean }
  ): Promise<{
    data: PaperworkPrintRow[] | null;
    error: { message: string } | null;
  }>;
}

const paperworkClient = supabase as unknown as {
  from(table: 'paperwork_prints'): PaperworkPrintQuery;
};

export function rowToPaperworkPrint(row: PaperworkPrintRow): ReplicatedPaperworkPrint {
  return {
    id: row.id,
    showId: row.show_id,
    scopeKind: row.scope_kind,
    ...(row.trial_id ? { trialId: row.trial_id } : {}),
    ...(row.class_id ? { classId: row.class_id } : {}),
    reportId: row.report_id,
    coverage: row.coverage,
    fingerprint: row.fingerprint,
    printedBy: row.printed_by,
    printedByName: row.printed_by_name,
    printedAt: row.printed_at,
    ...(row.voided_at ? { voidedAt: row.voided_at } : {}),
    ...(row.voided_by ? { voidedBy: row.voided_by } : {}),
    ...(row.void_reason ? { voidReason: row.void_reason } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    _version: row.version,
  };
}

export class ReplicatedPaperworkPrintsTable extends ReplicatedTable<ReplicatedPaperworkPrint> {
  constructor() {
    super('paperwork_prints', undefined, { logger });
  }

  async sync(syncScopeId?: string): Promise<SyncResult> {
    const showId = syncScopeId?.trim();
    if (!showId) {
      return {
        tableName: this.getTableName(),
        success: true,
        operation: 'incremental-sync',
        rowsAffected: 0,
        duration: 0,
      };
    }

    const adapter: SyncReplicatedTableAdapter<PaperworkPrintRow, ReplicatedPaperworkPrint> = {
      fetchRemoteRows: async ({ since }) => {
        const { data, error } = await paperworkClient
          .from('paperwork_prints')
          .select('*')
          .eq('show_id', showId)
          .gt('updated_at', new Date(since).toISOString())
          .order('updated_at', { ascending: true });
        if (error) throw new Error(`Paperwork print refresh failed: ${error.message}`);
        return data ?? [];
      },
      getRemoteId: row => row.id,
      getRemoteUpdatedAt: row => parseUpdatedAtMs(row.updated_at),
      toLocalRow: rowToPaperworkPrint,
      rebuildUpdatePayload: row => this.toVoidPayload(row),
      filterLocalRows: rows => rows.filter(row => row.showId === showId),
      resolveConflict: (local, remote) => this.resolveConflict(local, remote),
    };

    const result = await syncReplicatedTable(
      this,
      adapter,
      { value: showId },
      { incrementalBufferMs: REPLICATION_INCREMENTAL_BUFFER_MS }
    );
    if (!result.success && result.error && !isAbortSyncError(result.error)) {
      logger.error(`[${this.getTableName()}] Sync failed:`, result.error);
      return { ...result, error: getSyncErrorMessage(result.error) };
    }
    return result;
  }

  async confirmPrinted(input: ConfirmPaperworkPrintInput): Promise<ReplicatedPaperworkPrint> {
    const id = input.id ?? crypto.randomUUID();
    const now = input.printedAt ?? new Date().toISOString();
    const record: ReplicatedPaperworkPrint = {
      id,
      showId: input.scope.showId,
      scopeKind: input.scope.kind,
      ...(input.scope.kind === 'trial' || input.scope.kind === 'class'
        ? { trialId: input.scope.trialId }
        : {}),
      ...(input.scope.kind === 'class' ? { classId: input.scope.classId } : {}),
      reportId: input.reportId,
      coverage: input.coverage,
      fingerprint: input.fingerprint,
      printedBy: input.printedBy,
      printedByName: input.printedByName.trim(),
      printedAt: now,
      createdAt: now,
      updatedAt: now,
      _version: 1,
      _lastModified: new Date(now),
      _syncStatus: 'pending',
      _localOnly: true,
    };
    await this.set(id, record, true);
    await this.queueMutation('INSERT', id, this.toInsertRow(record));
    return record;
  }

  async voidPrint(input: {
    id: string;
    voidedBy: string;
    reason: string;
    voidedAt?: string | undefined;
  }): Promise<void> {
    const existing = await this.get(input.id);
    if (!existing) throw new Error('Paperwork print record not found.');
    if (existing.voidedAt) throw new Error('Paperwork print record is already marked incorrect.');
    const voidedAt = input.voidedAt ?? new Date().toISOString();
    const updated: ReplicatedPaperworkPrint = {
      ...existing,
      voidedAt,
      voidedBy: input.voidedBy,
      voidReason: input.reason.trim(),
      updatedAt: voidedAt,
      _lastModified: new Date(voidedAt),
      _syncStatus: 'pending',
    };
    await this.set(input.id, updated, true);
    await this.queueMutation('UPDATE', input.id, this.toVoidPayload(updated));
  }

  async getByShow(showId: string): Promise<ReplicatedPaperworkPrint[]> {
    return (await this.getAll()).filter(record => record.showId === showId);
  }

  protected resolveConflict(
    local: ReplicatedPaperworkPrint,
    remote: ReplicatedPaperworkPrint
  ): ReplicatedPaperworkPrint {
    return local._syncStatus === 'pending' ? local : remote;
  }

  protected override rebuildUpdatePayload(
    record: ReplicatedPaperworkPrint
  ): Record<string, unknown> {
    return this.toVoidPayload(record);
  }

  private toInsertRow(record: ReplicatedPaperworkPrint): Record<string, unknown> {
    return {
      id: record.id,
      show_id: record.showId,
      trial_id: record.trialId ?? null,
      class_id: record.classId ?? null,
      scope_kind: record.scopeKind,
      report_id: record.reportId,
      coverage: record.coverage,
      fingerprint: record.fingerprint,
      printed_by: record.printedBy,
      printed_by_name: record.printedByName,
      printed_at: record.printedAt,
    };
  }

  private toVoidPayload(record: ReplicatedPaperworkPrint): Record<string, unknown> {
    return {
      voided_at: record.voidedAt ?? null,
      voided_by: record.voidedBy ?? null,
      void_reason: record.voidReason ?? null,
    };
  }
}

export const replicatedPaperworkPrintsTable = new ReplicatedPaperworkPrintsTable();
