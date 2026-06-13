import { describe, expect, it } from 'vitest';
import type { ReplicatedRow, ReplicationConflictSnapshot } from '../types';
import {
  buildReplicatedRowForSet,
  buildSyncedReplicatedRow,
  collectFreshLocalIds,
  selectStaleCleanRows,
} from './ReplicatedTableRowState';

interface TestRow {
  id: string;
  status: string;
}

const now = 1_770_000_000_000;

function row(overrides: Partial<ReplicatedRow<TestRow>> = {}): ReplicatedRow<TestRow> {
  return {
    tableName: 'entries',
    id: 'entry-1',
    data: { id: 'entry-1', status: 'ready' },
    version: 1,
    lastSyncedAt: now - 10,
    lastAccessedAt: now - 10,
    accessCount: 2,
    lastModifiedAt: now - 10,
    isDirty: false,
    syncStatus: 'synced',
    ...overrides,
  };
}

function conflict(): ReplicationConflictSnapshot<TestRow> {
  return {
    tableName: 'entries',
    rowId: 'entry-1',
    fields: ['status'],
    localData: { id: 'entry-1', status: 'checked-in' },
    remoteData: { id: 'entry-1', status: 'absent' },
    baseData: { id: 'entry-1', status: 'ready' },
    baseVersion: 1,
    localVersion: 2,
    remoteServerVersion: 5,
    detectedAt: now - 1,
  };
}

describe('ReplicatedTableRowState', () => {
  describe('buildReplicatedRowForSet', () => {
    it('captures the clean base snapshot when a row first becomes dirty', () => {
      const cleanRow = row({
        version: 3,
        data: { id: 'entry-1', status: 'ready' },
        serverVersion: 9,
      });

      const result = buildReplicatedRowForSet({
        tableName: 'entries',
        id: 'entry-1',
        data: { id: 'entry-1', status: 'checked-in' },
        isDirty: true,
        existingRow: cleanRow,
        now,
      });

      expect(result).toMatchObject({
        tableName: 'entries',
        id: 'entry-1',
        data: { id: 'entry-1', status: 'checked-in' },
        version: 4,
        isDirty: true,
        syncStatus: 'pending',
        baseData: { id: 'entry-1', status: 'ready' },
        baseVersion: 3,
        serverVersion: 9,
      });
    });

    it('preserves the original base snapshot when an already dirty row changes again', () => {
      const dirtyRow = row({
        version: 4,
        data: { id: 'entry-1', status: 'checked-in' },
        isDirty: true,
        syncStatus: 'pending',
        baseData: { id: 'entry-1', status: 'ready' },
        baseVersion: 3,
        serverVersion: 9,
      });

      const result = buildReplicatedRowForSet({
        tableName: 'entries',
        id: 'entry-1',
        data: { id: 'entry-1', status: 'absent' },
        isDirty: true,
        existingRow: dirtyRow,
        now,
      });

      expect(result).toMatchObject({
        data: { id: 'entry-1', status: 'absent' },
        version: 5,
        syncStatus: 'pending',
        baseData: { id: 'entry-1', status: 'ready' },
        baseVersion: 3,
        serverVersion: 9,
      });
    });

    it('keeps an unresolved conflict when a dirty edit is stored before resolution', () => {
      const snapshot = conflict();
      const conflictedRow = row({
        version: 4,
        data: { id: 'entry-1', status: 'checked-in' },
        isDirty: true,
        syncStatus: 'conflict',
        baseData: { id: 'entry-1', status: 'ready' },
        baseVersion: 3,
        conflict: snapshot,
        serverVersion: 9,
      });

      const result = buildReplicatedRowForSet({
        tableName: 'entries',
        id: 'entry-1',
        data: { id: 'entry-1', status: 'excused' },
        isDirty: true,
        existingRow: conflictedRow,
        now,
      });

      expect(result).toMatchObject({
        data: { id: 'entry-1', status: 'excused' },
        syncStatus: 'conflict',
        conflict: snapshot,
      });
    });

    it('uses incoming server version for clean server writes', () => {
      const existing = row({ version: 4, serverVersion: 9 });

      const result = buildReplicatedRowForSet({
        tableName: 'entries',
        id: 'entry-1',
        data: { id: 'entry-1', status: 'absent' },
        isDirty: false,
        existingRow: existing,
        incomingServerVersion: 10,
        now,
      });

      expect(result).toMatchObject({
        data: { id: 'entry-1', status: 'absent' },
        isDirty: false,
        syncStatus: 'synced',
        serverVersion: 10,
      });
      expect(result).not.toHaveProperty('baseData');
      expect(result).not.toHaveProperty('baseVersion');
      expect(result.conflict).toBeUndefined();
    });
  });

  describe('buildSyncedReplicatedRow', () => {
    it('clears dirty metadata while preserving row data and server version', () => {
      const dirtyRow = row({
        version: 4,
        data: { id: 'entry-1', status: 'checked-in' },
        isDirty: true,
        syncStatus: 'conflict',
        baseData: { id: 'entry-1', status: 'ready' },
        baseVersion: 3,
        conflict: conflict(),
        serverVersion: 9,
      });

      expect(buildSyncedReplicatedRow(dirtyRow, now)).toMatchObject({
        data: { id: 'entry-1', status: 'checked-in' },
        version: 4,
        isDirty: false,
        syncStatus: 'synced',
        lastSyncedAt: now,
        serverVersion: 9,
        baseData: undefined,
        baseVersion: undefined,
        conflict: undefined,
      });
    });
  });

  describe('stale row selectors', () => {
    it('collects only fresh local ids', () => {
      const rows = [row({ id: 'fresh-1' }), row({ id: 'expired-1' }), row({ id: 'fresh-2' })];

      expect(collectFreshLocalIds(rows, staleRow => staleRow.id === 'expired-1')).toEqual(
        new Set(['fresh-1', 'fresh-2'])
      );
    });

    it('selects clean rows missing from the server and preserves dirty rows', () => {
      const rows = [
        row({ id: 'server-kept', isDirty: false }),
        row({ id: 'server-missing-clean', isDirty: false }),
        row({ id: 'server-missing-dirty', isDirty: true, syncStatus: 'pending' }),
      ];

      expect(selectStaleCleanRows(rows, new Set(['server-kept']))).toEqual([rows[1]]);
    });
  });
});
