import type { SupabaseClient } from '@supabase/supabase-js';
import { vi } from 'vitest';
import type { DirtyRowComparePolicy } from '../conflict/detectDirtyRowConflict';
import { ReplicatedTable } from '../core/ReplicatedTable';
import type { RowRefetchAdapter } from '../refetchDirtyRowsById';
import type { SyncOptions, SyncResult } from '../types';

/**
 * Shared fixtures for the acknowledgement-rebase tests (MYK9-1220, MYK9-1221):
 * a score table whose remote columns are named differently from its local
 * fields (so a hand-mapped shortcut cannot pass), and a fake server that applies
 * direct UPDATEs against `version=eq.<n>` and bumps the version.
 */
export interface ScoreRow {
  id: string;
  result: string | null;
  reason: string | null;
  placement: number | null;
  endedAt: string | null;
}

export interface RemoteScore {
  id: string;
  result_status: string | null;
  reason_text: string | null;
  final_placement: number | null;
  ended_at: string | null;
  version: number;
}

export class ScoreTable extends ReplicatedTable<ScoreRow> {
  constructor(
    name: string,
    private readonly policy?: DirtyRowComparePolicy
  ) {
    super(name);
  }

  async sync(_scope: string, _options?: Partial<SyncOptions>): Promise<SyncResult> {
    return {
      tableName: this.getTableName(),
      success: true,
      operation: 'incremental-sync',
      rowsAffected: 0,
      duration: 0,
    };
  }

  protected resolveConflict(_local: ScoreRow, remote: ScoreRow): ScoreRow {
    return remote;
  }

  adapter(): RowRefetchAdapter<RemoteScore, ScoreRow> {
    return this.getRowRefetchAdapter();
  }

  protected override getRowRefetchAdapter(): RowRefetchAdapter<RemoteScore, ScoreRow> {
    return {
      fetchRowsById: async () => [],
      getRemoteId: remote => remote.id,
      toLocalRow: remote => ({
        id: remote.id,
        result: remote.result_status,
        reason: remote.reason_text,
        placement: remote.final_placement,
        endedAt: remote.ended_at,
      }),
      toRemoteRow: local => ({
        id: local.id,
        result_status: local.result,
        reason_text: local.reason,
        final_placement: local.placement,
        ended_at: local.endedAt,
      }),
      rebuildUpdatePayload: local => ({
        id: local.id,
        result_status: local.result,
        reason_text: local.reason,
      }),
      ...(this.policy && { dirtyRowComparePolicy: this.policy }),
    };
  }
}

export const AUTH = 'ack-rebase-user';

/** A server that applies direct UPDATEs against `version=eq.<n>` and bumps the version. */
export function makeServer(options: { holdFirstAck?: boolean } = {}) {
  // With `holdFirstAck` the first UPDATE commits on the server, then its response
  // waits: `committed` resolves once the server holds the write, `release()`
  // lets the response (the acknowledgement) through.
  let release: () => void = () => undefined;
  let markCommitted: () => void = () => undefined;
  const gate = new Promise<void>(resolve => (release = resolve));
  const committed = new Promise<void>(resolve => (markCommitted = resolve));
  let held = !options.holdFirstAck;
  const row: RemoteScore = {
    id: '1',
    result_status: 'abs',
    reason_text: 'R0',
    final_placement: null,
    ended_at: null,
    version: 3,
  };
  const updates: Array<{ data: Record<string, unknown>; expectedVersion: unknown }> = [];
  const from = vi.fn(() => ({
    update: (data: Record<string, unknown>) => {
      const call = { data, expectedVersion: undefined as unknown };
      updates.push(call);
      const builder = {
        eq(column: string, value: unknown) {
          if (column === 'version') call.expectedVersion = value;
          return builder;
        },
        async select() {
          if (call.expectedVersion !== undefined && call.expectedVersion !== row.version) {
            return { data: [], error: null };
          }
          Object.assign(row, data, { version: row.version + 1 });
          if (!held) {
            held = true;
            markCommitted();
            await gate;
          }
          return { data: [{ id: '1', version: row.version }], error: null };
        },
      };
      return builder;
    },
  }));
  return {
    row,
    updates,
    committed,
    release: () => release(),
    supabase: { from } as unknown as SupabaseClient,
  };
}
