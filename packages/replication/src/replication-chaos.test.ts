import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplicatedTable } from './core/ReplicatedTable';
import { syncReplicatedTable, type SyncReplicatedTableAdapter } from './syncReplicatedTable';
import type { SyncOptions, SyncResult } from './types';

type ChaosRow = Record<string, unknown> & { id: string };
type RemoteChaosRow = Record<string, unknown> & { id: string | number; version?: number };

class ChaosTable extends ReplicatedTable<ChaosRow> {
  async sync(_licenseKey: string, _options?: Partial<SyncOptions>): Promise<SyncResult> {
    return {
      tableName: this.getTableName(),
      success: true,
      operation: 'incremental-sync',
      rowsAffected: 0,
      duration: 0,
    };
  }

  // The resolver intentionally picks remote data. With conflict surfacing
  // enabled, same-field dirty collisions must be held before this can overwrite
  // local edits.
  protected resolveConflict(_local: ChaosRow, remote: ChaosRow): ChaosRow {
    return remote;
  }
}

function adapterFor(
  remoteRows: RemoteChaosRow[]
): SyncReplicatedTableAdapter<RemoteChaosRow, ChaosRow> {
  return {
    fetchRemoteRows: vi.fn(async () => remoteRows),
    getRemoteId: remote => String(remote.id),
    toLocalRow: remote => ({ ...remote, id: String(remote.id) }),
  };
}

describe('replication chaos guards', () => {
  let table: ChaosTable;

  beforeEach(async () => {
    const { databaseManager } = await import('./core/DatabaseManager');
    await databaseManager.reset();
    table = new ChaosTable(`chaos_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  });

  afterEach(async () => {
    const { databaseManager } = await import('./core/DatabaseManager');
    await databaseManager.reset();
  });

  it.each([
    {
      tableName: 'entries',
      dirtyField: 'check_in_status',
      clean: {
        id: 'entry-1',
        check_in_status: 'no-status',
        dog_call_name: 'Ziva',
        handler_name: 'Jane Handler',
      },
      local: {
        id: 'entry-1',
        check_in_status: 'in-ring',
        dog_call_name: 'Ziva',
        handler_name: 'Jane Handler',
      },
      remote: {
        id: 'entry-1',
        check_in_status: 'absent',
        dog_call_name: 'Ziva',
        handler_name: 'Jane Handler',
        version: 9,
      },
      enrichmentField: 'dog_call_name',
    },
    {
      tableName: 'classes',
      dirtyField: 'status',
      clean: {
        id: 'class-1',
        status: 'upcoming',
        trial_name: 'Saturday Trial 1',
        judge_name: 'Judge Avery',
      },
      local: {
        id: 'class-1',
        status: 'in_progress',
        trial_name: 'Saturday Trial 1',
        judge_name: 'Judge Avery',
      },
      remote: {
        id: 'class-1',
        status: 'completed',
        trial_name: 'Saturday Trial 1',
        judge_name: 'Judge Avery',
        version: 12,
      },
      enrichmentField: 'judge_name',
    },
    {
      tableName: 'scores',
      dirtyField: 'result_status',
      clean: {
        id: 'score-1',
        result_status: 'pending',
        dog_call_name: 'Rex',
        class_name: 'Interior Advanced',
      },
      local: {
        id: 'score-1',
        result_status: 'qualified',
        dog_call_name: 'Rex',
        class_name: 'Interior Advanced',
      },
      remote: {
        id: 'score-1',
        result_status: 'non_qualifying',
        dog_call_name: 'Rex',
        class_name: 'Interior Advanced',
        version: 4,
      },
      enrichmentField: 'class_name',
    },
  ])(
    'surfaces same-field dirty-row conflicts for $tableName without dropping enrichment fields',
    async ({ dirtyField, clean, local, remote, enrichmentField }) => {
      const events: CustomEvent[] = [];
      const handler = (event: Event) => events.push(event as CustomEvent);
      window.addEventListener('replication:conflict', handler);

      await table.set(clean.id, clean);
      await table.set(local.id, local, true);

      const result = await syncReplicatedTable(
        table,
        adapterFor([remote]),
        {},
        { conflictSurfacingEnabled: true }
      );

      window.removeEventListener('replication:conflict', handler);

      expect(events).toHaveLength(1);
      expect(events[0]!.detail).toMatchObject({
        rowId: clean.id,
        fields: [dirtyField],
        localData: expect.objectContaining({
          [dirtyField]: local[dirtyField],
          [enrichmentField]: local[enrichmentField],
        }),
        remoteData: expect.objectContaining({
          [dirtyField]: remote[dirtyField],
          [enrichmentField]: remote[enrichmentField],
        }),
        baseData: expect.objectContaining({
          [dirtyField]: clean[dirtyField],
          [enrichmentField]: clean[enrichmentField],
        }),
        remoteServerVersion: remote.version,
      });

      await expect(table.get(clean.id)).resolves.toMatchObject({
        [dirtyField]: local[dirtyField],
        [enrichmentField]: local[enrichmentField],
      });
      await expect(table.getReplicatedRow(clean.id)).resolves.toMatchObject({
        syncStatus: 'conflict',
        isDirty: true,
        conflict: expect.objectContaining({
          fields: [dirtyField],
          remoteServerVersion: remote.version,
        }),
      });
      expect(result.rowsAffected).toBe(1);
      expect(result.conflictsResolved).toBe(1);
    }
  );
});
