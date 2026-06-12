import { describe, expect, it } from 'vitest';
import type { ReplicatedRow, ReplicationConflictSnapshot } from '../types';
import {
  applyConflictSnapshot,
  buildRemoteReplacementRow,
  clearConflictSnapshot,
  getConflictSnapshots,
} from './ReplicatedTableConflict';

interface TestEntity {
  id: string;
  name: string;
  status?: string;
}

function row(overrides: Partial<ReplicatedRow<TestEntity>> = {}): ReplicatedRow<TestEntity> {
  return {
    tableName: overrides.tableName ?? 'entries',
    id: overrides.id ?? 'entry-1',
    data: overrides.data ?? { id: overrides.id ?? 'entry-1', name: 'Rex', status: 'ready' },
    version: overrides.version ?? 2,
    lastSyncedAt: overrides.lastSyncedAt ?? 100,
    lastAccessedAt: overrides.lastAccessedAt ?? 200,
    accessCount: overrides.accessCount ?? 3,
    lastModifiedAt: overrides.lastModifiedAt ?? 300,
    isDirty: overrides.isDirty ?? true,
    syncStatus: overrides.syncStatus ?? 'pending',
    baseData: overrides.baseData,
    baseVersion: overrides.baseVersion,
    serverVersion: overrides.serverVersion,
    conflict: overrides.conflict,
  };
}

function snapshot(
  overrides: Partial<ReplicationConflictSnapshot<TestEntity>> = {}
): ReplicationConflictSnapshot<TestEntity> {
  return {
    tableName: overrides.tableName ?? 'entries',
    rowId: overrides.rowId ?? 'entry-1',
    fields: overrides.fields ?? ['status'],
    localData: overrides.localData ?? { id: 'entry-1', name: 'Rex', status: 'checked-in' },
    remoteData: overrides.remoteData ?? { id: 'entry-1', name: 'Rex', status: 'absent' },
    baseData: overrides.baseData ?? { id: 'entry-1', name: 'Rex', status: 'ready' },
    baseVersion: overrides.baseVersion ?? 1,
    localVersion: overrides.localVersion ?? 2,
    remoteServerVersion: overrides.remoteServerVersion ?? 5,
    detectedAt: overrides.detectedAt ?? 400,
  };
}

describe('ReplicatedTable conflict row helpers', () => {
  it('returns null for missing or stale conflict snapshots', () => {
    expect(applyConflictSnapshot(undefined, snapshot())).toBeNull();
    expect(applyConflictSnapshot(row({ version: 3 }), snapshot({ localVersion: 2 }))).toBeNull();
  });

  it('marks a valid conflict snapshot as dirty conflict state', () => {
    const existing = row({ syncStatus: 'pending', version: 2 });
    const conflict = snapshot({ localVersion: 2 });

    expect(applyConflictSnapshot(existing, conflict)).toEqual({
      ...existing,
      isDirty: true,
      syncStatus: 'conflict',
      conflict,
    });
  });

  it('clears only conflicted rows and preserves local row data', () => {
    const pending = row({ syncStatus: 'pending', conflict: undefined });
    expect(clearConflictSnapshot(pending, 5)).toBeNull();

    const conflicted = row({ syncStatus: 'conflict', conflict: snapshot(), serverVersion: 4 });
    expect(clearConflictSnapshot(conflicted, 5)).toEqual({
      ...conflicted,
      syncStatus: 'pending',
      conflict: undefined,
      serverVersion: 5,
    });
  });

  it('keeps existing serverVersion when clearing conflict without a new server version', () => {
    const conflicted = row({ syncStatus: 'conflict', conflict: snapshot(), serverVersion: 4 });

    expect(clearConflictSnapshot(conflicted)).toEqual({
      ...conflicted,
      syncStatus: 'pending',
      conflict: undefined,
      serverVersion: 4,
    });
  });

  it('builds a clean remote replacement row with normalized id and cleared conflict metadata', () => {
    const existing = row({
      id: 'entry-1',
      version: 4,
      accessCount: 7,
      serverVersion: 3,
      syncStatus: 'conflict',
      conflict: snapshot(),
      baseData: { id: 'entry-1', name: 'Rex', status: 'ready' },
      baseVersion: 1,
    });

    expect(
      buildRemoteReplacementRow({
        tableName: 'entries',
        id: 'entry-1',
        remoteData: { id: 'remote-id', name: 'Rex', status: 'absent' },
        existingRow: existing,
        remoteServerVersion: 8,
        now: 1_000,
      })
    ).toEqual({
      tableName: 'entries',
      id: 'entry-1',
      data: { id: 'entry-1', name: 'Rex', status: 'absent' },
      version: 5,
      lastSyncedAt: 1_000,
      lastAccessedAt: 1_000,
      accessCount: 7,
      lastModifiedAt: 1_000,
      isDirty: false,
      syncStatus: 'synced',
      baseData: undefined,
      baseVersion: undefined,
      serverVersion: 8,
      conflict: undefined,
    });
  });

  it('builds a first remote replacement row when no existing row exists', () => {
    expect(
      buildRemoteReplacementRow({
        tableName: 'entries',
        id: 'entry-1',
        remoteData: { id: 'remote-id', name: 'Rex' },
        existingRow: undefined,
        now: 1_000,
      })
    ).toMatchObject({
      id: 'entry-1',
      data: { id: 'entry-1', name: 'Rex' },
      version: 1,
      accessCount: 0,
      isDirty: false,
      syncStatus: 'synced',
    });
  });

  it('returns only persisted conflict snapshots', () => {
    const conflict = snapshot({ rowId: 'entry-1' });
    const rows = [
      row({ id: 'entry-1', syncStatus: 'conflict', conflict }),
      row({ id: 'entry-2', syncStatus: 'pending', conflict: snapshot({ rowId: 'entry-2' }) }),
      row({ id: 'entry-3', syncStatus: 'conflict', conflict: undefined }),
    ];

    expect(getConflictSnapshots(rows)).toEqual([conflict]);
  });
});
