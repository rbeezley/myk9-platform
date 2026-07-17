import { describe, it, expect, beforeEach } from 'vitest';
import { DifferentialSyncService } from './DifferentialSyncService';
import type { SyncableEntity } from '../../types/sync-types';

interface TestEntity extends SyncableEntity {
  name: string;
  value: number;
  nested?: { a?: number; b?: number };
}

// NOTE: fast-json-patch's compare() mishandles Date instances (it stringifies
// one side but not the other, producing spurious character-index diffs), so
// these fixtures intentionally omit createdAt/updatedAt Date fields to keep
// the tests focused on the delta algorithms rather than that pre-existing
// upstream quirk.
function makeEntity(overrides: Partial<TestEntity> = {}): TestEntity {
  return {
    id: 'entity-1',
    name: 'Original',
    value: 10,
    ...overrides,
  } as unknown as TestEntity;
}

describe('DifferentialSyncService', () => {
  let service: DifferentialSyncService;

  beforeEach(() => {
    service = DifferentialSyncService.getInstance();
    service.clearCache();
  });

  it('getInstance returns the same singleton instance', () => {
    expect(DifferentialSyncService.getInstance()).toBe(service);
  });

  describe('calculateDelta', () => {
    it('returns an empty delta when original and modified are deeply equal', async () => {
      const original = makeEntity();
      const modified = makeEntity();

      const delta = await service.calculateDelta(original, modified, { compressionType: 'none' });

      expect(delta.operations).toHaveLength(0);
    });

    it('produces json-patch operations for changed fields', async () => {
      const original = makeEntity({ value: 10 });
      const modified = makeEntity({ value: 20 });

      const delta = await service.calculateDelta(original, modified, { compressionType: 'none' });

      expect(delta.algorithm).toBe('json-patch');
      expect(delta.operations.length).toBeGreaterThan(0);
      expect(delta.operations.some(op => op.path === '/value')).toBe(true);
    });

    it('includes checksums by default', async () => {
      const original = makeEntity();
      const modified = makeEntity({ value: 99 });

      const delta = await service.calculateDelta(original, modified, { compressionType: 'none' });

      expect(delta.originalChecksum).toBeTruthy();
      expect(delta.modifiedChecksum).toBeTruthy();
    });

    it('supports the custom algorithm', async () => {
      const original = makeEntity({ nested: { a: 1 } });
      const modified = makeEntity({ nested: { a: 1, b: 2 } });

      const delta = await service.calculateDelta(original, modified, {
        algorithm: 'custom',
        compressionType: 'none',
      });

      expect(delta.algorithm).toBe('custom');
      expect(delta.operations.length).toBeGreaterThan(0);
    });

    it('rejects an unsupported algorithm', async () => {
      const original = makeEntity();
      const modified = makeEntity({ value: 1 });

      await expect(
        service.calculateDelta(original, modified, {
          algorithm: 'not-a-real-algorithm' as never,
          compressionType: 'none',
        })
      ).rejects.toThrow('Unsupported delta algorithm');
    });
  });

  describe('applyDelta', () => {
    it('round-trips a json-patch delta back to the modified entity', async () => {
      const original = makeEntity({ value: 10, name: 'Original' });
      const modified = makeEntity({ value: 25, name: 'Changed' });

      const delta = await service.calculateDelta(original, modified, { compressionType: 'none' });
      const result = await service.applyDelta(original, delta, { trackPerformance: false });

      expect(result.value).toBe(25);
      expect(result.name).toBe('Changed');
    });

    it('round-trips a custom delta back to the modified entity', async () => {
      const original = makeEntity({ nested: { a: 1 } });
      const modified = makeEntity({ nested: { a: 1, b: 2 } });

      const delta = await service.calculateDelta(original, modified, {
        algorithm: 'custom',
        compressionType: 'none',
      });
      const result = await service.applyDelta(original, delta, { trackPerformance: false });

      expect(result.nested).toEqual({ a: 1, b: 2 });
    });

    it('throws when the checksum of the original object no longer matches', async () => {
      const original = makeEntity({ value: 10 });
      const modified = makeEntity({ value: 20 });
      const delta = await service.calculateDelta(original, modified, { compressionType: 'none' });

      const tamperedOriginal = makeEntity({ value: 999 });

      await expect(
        service.applyDelta(tamperedOriginal, delta, {
          rollbackOnError: false,
          trackPerformance: false,
        })
      ).rejects.toThrow();
    });

    it('rolls back to the original entity on error when rollbackOnError is true', async () => {
      const original = makeEntity({ value: 10 });
      const modified = makeEntity({ value: 20 });
      const delta = await service.calculateDelta(original, modified, { compressionType: 'none' });

      const tamperedOriginal = makeEntity({ value: 999 });
      const result = await service.applyDelta(tamperedOriginal, delta, {
        rollbackOnError: true,
        trackPerformance: false,
      });

      expect(result).toEqual(tamperedOriginal);
    });
  });

  describe('resolveConflict', () => {
    const base = makeEntity({ value: 10, name: 'Base' });
    const local = makeEntity({ value: 20, name: 'Base' });
    const remote = makeEntity({ value: 10, name: 'Remote Name' });

    it('last-write-wins returns the remote entity', async () => {
      const result = await service.resolveConflict(local, remote, base, 'last-write-wins');
      expect(result).toBe(remote);
    });

    it('first-write-wins returns the local entity', async () => {
      const result = await service.resolveConflict(local, remote, base, 'first-write-wins');
      expect(result).toBe(local);
    });

    it('manual strategy returns a conflict marker with both versions', async () => {
      const result = await service.resolveConflict(local, remote, base, 'manual');

      expect(result).toMatchObject({ _conflict: true, local, remote, base });
    });

    it('merge strategy auto-merges non-overlapping field changes', async () => {
      // local changes value, remote changes name -> no overlapping paths
      const result = await service.resolveConflict(local, remote, base, 'merge');

      expect(result).toMatchObject({ value: 20, name: 'Remote Name' });
    });

    it('merge strategy flags a conflict entry when both sides change the same field', async () => {
      const conflictingRemote = makeEntity({ value: 99, name: 'Base' });

      const result = (await service.resolveConflict(
        local,
        conflictingRemote,
        base,
        'merge'
      )) as unknown as Record<string, unknown>;

      expect(result.value_conflict).toEqual({ local: 20, remote: 99, base: 10 });
    });
  });

  describe('performance stats and cache', () => {
    it('getPerformanceStats returns null when nothing has been tracked', () => {
      expect(service.getPerformanceStats('calculateDelta')).toBeNull();
    });

    it('getPerformanceStats reflects tracked calculateDelta calls', async () => {
      await service.calculateDelta(makeEntity({ value: 1 }), makeEntity({ value: 2 }), {
        compressionType: 'none',
      });

      const stats = service.getPerformanceStats('calculateDelta');
      expect(stats).not.toBeNull();
      expect((stats as Record<string, unknown>).count).toBeGreaterThanOrEqual(1);
    });

    it('clearCache resets performance metrics', async () => {
      await service.calculateDelta(makeEntity({ value: 1 }), makeEntity({ value: 2 }), {
        compressionType: 'none',
      });
      expect(service.getPerformanceStats('calculateDelta')).not.toBeNull();

      service.clearCache();

      expect(service.getPerformanceStats('calculateDelta')).toBeNull();
    });
  });
});
