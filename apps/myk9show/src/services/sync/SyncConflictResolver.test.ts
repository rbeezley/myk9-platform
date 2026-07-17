import { describe, it, expect } from 'vitest';
import { SyncConflictResolver } from './SyncConflictResolver';
import type { Conflict } from '@/types/conflict-types';

describe('SyncConflictResolver (stub implementation)', () => {
  it('resolveConflict defaults to keeping local data and marks the resolution manual', async () => {
    const local = { id: 'entry-1', value: 'local' };
    const remote = { id: 'entry-1', value: 'remote' };

    const resolution = await SyncConflictResolver.resolveConflict(local, remote);

    expect(resolution.resolvedEntity).toBe(local);
    expect(resolution.strategy).toBe('user_decides');
    expect(resolution.automatic).toBe(false);
    expect(resolution.resolvedBy).toBe('system');
    expect(resolution.conflictId).toMatch(/^stub-/);
  });

  it('resolveConflict passes through a custom strategy', async () => {
    const resolution = await SyncConflictResolver.resolveConflict('local', 'remote', 'newest_wins');

    expect(resolution.strategy).toBe('newest_wins');
  });

  it('autoResolve always returns null (not yet implemented)', async () => {
    const conflict = { id: 'conflict-1' } as unknown as Conflict;

    const result = await SyncConflictResolver.autoResolve(conflict);

    expect(result).toBeNull();
  });

  it('canAutoResolve is conservative and always returns false', () => {
    const conflict = { id: 'conflict-1' } as unknown as Conflict;

    expect(SyncConflictResolver.canAutoResolve(conflict)).toBe(false);
  });
});
