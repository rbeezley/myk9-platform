// apps/myk9show/src/hooks/__tests__/conflictResolutionUtils.test.ts
import { describe, it, expect } from 'vitest';
import {
  STATUS_MAP,
  STRATEGY_FROM_REPLICATION,
  STRATEGY_TO_REPLICATION,
  mapConflict,
  mapResolution,
  filterByEntityType,
} from '../conflictResolutionUtils';
import type { Conflict } from '@myk9/replication';

function makeConflict(overrides: Partial<Conflict> = {}): Conflict {
  return {
    id: 'c1',
    entityId: 'e1',
    entityType: 'show',
    localData: { name: 'local' },
    remoteData: { name: 'remote' },
    detectedAt: new Date('2026-01-01T00:00:00Z'),
    status: 'pending',
    ...overrides,
  };
}

describe('STATUS_MAP', () => {
  it('maps pending → pending', () => expect(STATUS_MAP['pending']).toBe('pending'));
  it('maps resolved → resolved', () => expect(STATUS_MAP['resolved']).toBe('resolved'));
  it('maps ignored → dismissed', () => expect(STATUS_MAP['ignored']).toBe('dismissed'));
});

describe('STRATEGY_FROM_REPLICATION', () => {
  it('last-write-wins → newest_wins', () =>
    expect(STRATEGY_FROM_REPLICATION['last-write-wins']).toBe('newest_wins'));
  it('server-authoritative → remote_wins', () =>
    expect(STRATEGY_FROM_REPLICATION['server-authoritative']).toBe('remote_wins'));
  it('client-authoritative → local_wins', () =>
    expect(STRATEGY_FROM_REPLICATION['client-authoritative']).toBe('local_wins'));
  it('field-level-merge → merge_automatic', () =>
    expect(STRATEGY_FROM_REPLICATION['field-level-merge']).toBe('merge_automatic'));
});

describe('STRATEGY_TO_REPLICATION', () => {
  it('local_wins → client-authoritative', () =>
    expect(STRATEGY_TO_REPLICATION['local_wins']).toBe('client-authoritative'));
  it('remote_wins → server-authoritative', () =>
    expect(STRATEGY_TO_REPLICATION['remote_wins']).toBe('server-authoritative'));
  it('merge_automatic → field-level-merge', () =>
    expect(STRATEGY_TO_REPLICATION['merge_automatic']).toBe('field-level-merge'));
  it('merge_manual → field-level-merge', () =>
    expect(STRATEGY_TO_REPLICATION['merge_manual']).toBe('field-level-merge'));
  it('newest_wins → last-write-wins', () =>
    expect(STRATEGY_TO_REPLICATION['newest_wins']).toBe('last-write-wins'));
  it('unknown key → undefined (caller provides fallback)', () =>
    expect(STRATEGY_TO_REPLICATION['unknown_key']).toBeUndefined());
});

describe('mapConflict', () => {
  it('maps all required fields', () => {
    const result = mapConflict(makeConflict());
    expect(result.id).toBe('c1');
    expect(result.entityId).toBe('e1');
    expect(result.entityType).toBe('show');
    expect(result.status).toBe('pending');
    expect(result.priority).toBe('medium');
    expect(result.conflictType).toBe('sync_conflict');
    expect(result.conflictFields).toEqual([]);
    expect(result.lastModifiedBy).toEqual({ local: 'local', remote: 'remote' });
  });

  it('defaults entityType to "unknown" when absent', () => {
    const result = mapConflict(makeConflict({ entityType: undefined }));
    expect(result.entityType).toBe('unknown');
  });

  it('uses dismissed for ignored status', () => {
    const result = mapConflict(makeConflict({ status: 'ignored' }));
    expect(result.status).toBe('dismissed');
  });

  it('falls back to pending for unrecognised status', () => {
    const result = mapConflict(makeConflict({ status: 'unknown_value' as never }));
    expect(result.status).toBe('pending');
  });
});

describe('mapResolution', () => {
  it('maps strategy and meta from resolution', () => {
    const resolvedAt = new Date('2026-01-02T00:00:00Z');
    const c = makeConflict({
      status: 'resolved',
      resolution: {
        strategy: 'last-write-wins',
        resolvedEntity: { id: '1' },
        resolvedAt,
        resolvedBy: 'user-abc',
      },
    });
    const result = mapResolution(c);
    expect(result.conflictId).toBe('c1');
    expect(result.strategy).toBe('newest_wins');
    expect(result.resolvedBy).toBe('user-abc');
    expect(result.resolvedAt).toBe(resolvedAt);
    expect(result.resolvedEntity).toEqual({ id: '1' });
    expect(result.automatic).toBe(true); // last-write-wins is not field-level-merge
  });

  it('returns safe defaults when resolution is absent', () => {
    const result = mapResolution(makeConflict({ resolution: undefined }));
    expect(result.strategy).toBe('merge_automatic');
    expect(result.resolvedBy).toBe('system');
    expect(result.resolvedEntity).toBeUndefined();
    expect(result.automatic).toBe(true);
  });

  it('marks automatic=false for field-level-merge', () => {
    const c = makeConflict({
      resolution: {
        strategy: 'field-level-merge',
        resolvedEntity: {},
        resolvedAt: new Date(),
      },
    });
    expect(mapResolution(c).automatic).toBe(false);
  });
});

describe('filterByEntityType', () => {
  const items = [
    { entityType: 'show', id: 1 },
    { entityType: 'dog', id: 2 },
    { entityType: 'show', id: 3 },
  ];

  it('returns all items when entityType is undefined', () => {
    expect(filterByEntityType(items, undefined)).toHaveLength(3);
  });

  it('returns only matching items', () => {
    const result = filterByEntityType(items, 'show');
    expect(result).toHaveLength(2);
    expect(result.every(i => i.entityType === 'show')).toBe(true);
  });

  it('returns empty array when nothing matches', () => {
    expect(filterByEntityType(items, 'trial')).toHaveLength(0);
  });
});
