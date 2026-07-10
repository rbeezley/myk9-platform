import { describe, expect, it } from 'vitest';
import type { ReplicatedClass } from '@/services/replication';
import { mergeClassData, replicatedToClass } from './class-store-helpers';
import type { SyncableClassData } from './class-store-types';

function replicatedClass(overrides: Partial<ReplicatedClass> = {}): ReplicatedClass {
  return {
    id: 'class-1',
    name: 'Novice A',
    ...overrides,
  };
}

describe('replicatedToClass', () => {
  it('carries results_released_at through so ResultsControlPage can gate on it', () => {
    const released = replicatedToClass(
      replicatedClass({ results_released_at: '2026-07-01T00:00:00Z' })
    );
    expect(released.results_released_at).toBe('2026-07-01T00:00:00Z');

    const notReleased = replicatedToClass(replicatedClass({ results_released_at: null }));
    expect(notReleased.results_released_at).toBeNull();
  });
});

describe('mergeClassData', () => {
  it('reflects the latest results_released_at from the replicated row, not stale local data', () => {
    const existing: SyncableClassData = {
      ...replicatedToClass(replicatedClass({ results_released_at: null })),
      trial: 'Trial 1',
    };

    const merged = mergeClassData(
      replicatedClass({ results_released_at: '2026-07-02T00:00:00Z' }),
      existing
    );

    expect(merged.results_released_at).toBe('2026-07-02T00:00:00Z');
    // Local-only fields are still preserved.
    expect(merged.trial).toBe('Trial 1');
  });
});
