/**
 * MYK9-2346: the classes sync opts into the engine's stale cleanup (hard-deleted classes must
 * leave the replica), and a class edit in flight never raises a false conflict on the
 * trigger-owned `time_limit_set_at` stamp.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { capturedAdapters } = vi.hoisted(() => ({
  capturedAdapters: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));
vi.mock('@/services/database/persistedAuthUserId', () => ({
  readPersistedAuthUserId: () => 'user-a',
}));
vi.mock('@/utils/logger', () => ({ logger: { warn: vi.fn(), log: vi.fn(), error: vi.fn() } }));
// The engine is not under test: capture the adapter the table hands it.
vi.mock('@myk9/replication', async importOriginal => ({
  ...(await importOriginal<typeof import('@myk9/replication')>()),
  syncReplicatedTable: vi.fn(async (_table: unknown, adapter: Record<string, unknown>) => {
    capturedAdapters.push(adapter);
    return { success: true };
  }),
}));

import { detectDirtyRowConflict } from '@myk9/replication';
import { CLASS_DIRTY_ROW_COMPARE_POLICY, ReplicatedClassesTable } from './ReplicatedClassesTable';

describe('ReplicatedClassesTable stale cleanup (MYK9-2346)', () => {
  beforeEach(() => {
    capturedAdapters.length = 0;
  });

  it('asks the engine to clean up hard-deleted classes on a full sync', async () => {
    await new ReplicatedClassesTable().sync('trial-1', { forceFullSync: true });

    expect(capturedAdapters).toHaveLength(1);
    expect(capturedAdapters[0]?.cleanupStaleRowsOnFullSync).toBe(true);
    expect(typeof capturedAdapters[0]?.getRemoteRowCount).toBe('function');
  });
});

describe('class max-time edit in flight (MYK9-2346)', () => {
  const base = { id: 'class-1', timeLimitSeconds: 120, timeLimitSetAt: '2026-01-01T00:00:00Z' };

  it('does not conflict when the server stamp moves while the local stamp is cleared', () => {
    const result = detectDirtyRowConflict({
      base,
      local: { ...base, timeLimitSeconds: 180, timeLimitSetAt: null },
      remote: { ...base, timeLimitSetAt: '2026-01-02T00:00:00Z' },
      comparePolicy: CLASS_DIRTY_ROW_COMPARE_POLICY,
    });

    expect(result.hasConflict).toBe(false);
    expect(result.fields).not.toContain('timeLimitSetAt');
    expect(result.adoptRemoteFields).toContain('timeLimitSetAt');
  });

  it('still conflicts when the time limit itself changed on both sides', () => {
    const result = detectDirtyRowConflict({
      base,
      local: { ...base, timeLimitSeconds: 180, timeLimitSetAt: null },
      remote: { ...base, timeLimitSeconds: 240, timeLimitSetAt: '2026-01-02T00:00:00Z' },
      comparePolicy: CLASS_DIRTY_ROW_COMPARE_POLICY,
    });

    expect(result.hasConflict).toBe(true);
    expect(result.fields).toEqual(['timeLimitSeconds']);
  });
});
