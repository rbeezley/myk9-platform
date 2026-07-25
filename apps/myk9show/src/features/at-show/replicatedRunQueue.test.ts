/**
 * Tests for the ReplicatedEntry → run-queue normalizer.
 *
 * Replicated rows store the armband as a string, order by `runOrder` (not
 * `exhibitorOrder`), and carry isScored/isInRing/status under both camelCase and
 * snake_case aliases. These pin that every alias resolves to the same queue.
 */

import { describe, expect, it } from 'vitest';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import {
  inRingReplicated,
  nextPendingReplicated,
  pendingReplicatedByRunOrder,
  toRunQueueEntry,
} from './replicatedRunQueue';

function row(overrides: Partial<ReplicatedEntry> & { id: string }): ReplicatedEntry {
  return { classId: 'class-1', ...overrides } as ReplicatedEntry;
}

describe('toRunQueueEntry', () => {
  it('parses the string armband into a number', () => {
    expect(toRunQueueEntry(row({ id: 'e1', armband: '412' })).armband).toBe(412);
  });

  it('falls back to armbandNumber, then to 0 for unusable values', () => {
    expect(toRunQueueEntry(row({ id: 'e1', armbandNumber: '7' })).armband).toBe(7);
    expect(toRunQueueEntry(row({ id: 'e2', armband: 'n/a' })).armband).toBe(0);
    expect(toRunQueueEntry(row({ id: 'e3' })).armband).toBe(0);
  });

  it('maps runOrder onto the exhibitorOrder sort key', () => {
    expect(toRunQueueEntry(row({ id: 'e1', armband: '9', runOrder: 2 })).exhibitorOrder).toBe(2);
  });

  it('resolves snake_case aliases for isScored and isInRing', () => {
    expect(toRunQueueEntry(row({ id: 'e1', is_scored: true })).isScored).toBe(true);
    expect(toRunQueueEntry(row({ id: 'e2', is_in_ring: true })).inRing).toBe(true);
  });

  it('falls back to entryStatus when status is absent', () => {
    expect(toRunQueueEntry(row({ id: 'e1', entryStatus: 'pulled' })).status).toBe('pulled');
  });

  // Replicated rows carry two status axes. `pulled` and `in-ring` only ever
  // appear on check_in_status — entry_status (migration 003) has neither — so
  // reading the lifecycle axis alone left gate-pulled dogs looking pending.
  it('takes pulled from the check-in axis, not the lifecycle axis', () => {
    expect(toRunQueueEntry(row({ id: 'e1', check_in_status: 'pulled' })).status).toBe('pulled');
    expect(toRunQueueEntry(row({ id: 'e2', checkInStatus: 'pulled' })).status).toBe('pulled');
  });

  it('treats a check-in status of in-ring as in the ring', () => {
    const normalized = toRunQueueEntry(row({ id: 'e1', check_in_status: 'in-ring' }));
    expect(normalized.inRing).toBe(true);
    expect(normalized.status).toBe('in-ring');
  });

  it('folds non-running lifecycle states onto pulled', () => {
    for (const lifecycle of ['withdrawn', 'scratched', 'absent']) {
      expect(toRunQueueEntry(row({ id: `e-${lifecycle}`, entryStatus: lifecycle })).status).toBe(
        'pulled'
      );
    }
  });

  it('does not let a benign lifecycle state mask an active check-in status', () => {
    const normalized = toRunQueueEntry(
      row({ id: 'e1', entryStatus: 'confirmed', check_in_status: 'at-gate' })
    );
    expect(normalized.status).toBe('at-gate');
  });

  it('carries the original row through for display fields', () => {
    const original = row({ id: 'e1', armband: '412', dogCallName: 'Bella', dogBreed: 'Golden' });
    expect(toRunQueueEntry(original).entry).toBe(original);
  });
});

describe('pendingReplicatedByRunOrder / nextPendingReplicated', () => {
  const entries = [
    row({ id: 'e1', armband: '1', is_in_ring: true }),
    row({ id: 'e2', armband: '2' }),
    row({ id: 'e3', armband: '3', is_scored: true }),
    row({ id: 'e4', armband: '4', entryStatus: 'pulled' }),
    row({ id: 'e5', armband: '5' }),
    row({ id: 'e6', armband: '6' }),
  ];

  it('excludes in-ring, scored, and pulled rows', () => {
    expect(pendingReplicatedByRunOrder(entries).map(e => e.id)).toEqual(['e2', 'e5', 'e6']);
  });

  it('excludes a dog pulled at the gate on show day', () => {
    const withGatePull = [
      row({ id: 'e1', armband: '1' }),
      row({ id: 'e2', armband: '2', entryStatus: 'confirmed', check_in_status: 'pulled' }),
      row({ id: 'e3', armband: '3' }),
    ];
    expect(pendingReplicatedByRunOrder(withGatePull).map(e => e.id)).toEqual(['e1', 'e3']);
  });

  it('excludes the in-ring dog when only the check-in status marks it', () => {
    const inRingViaCheckIn = [
      row({ id: 'e1', armband: '1', entryStatus: 'competing', check_in_status: 'in-ring' }),
      row({ id: 'e2', armband: '2' }),
    ];
    expect(pendingReplicatedByRunOrder(inRingViaCheckIn).map(e => e.id)).toEqual(['e2']);
    expect(inRingReplicated(inRingViaCheckIn)?.id).toBe('e1');
  });

  it('orders by runOrder ahead of armband', () => {
    const scrambled = [
      row({ id: 'late', armband: '1', runOrder: 9 }),
      row({ id: 'early', armband: '99', runOrder: 1 }),
    ];
    expect(pendingReplicatedByRunOrder(scrambled).map(e => e.id)).toEqual(['early', 'late']);
  });

  it('returns the next N and preserves display fields', () => {
    const next = nextPendingReplicated(entries, 2);
    expect(next.map(e => e.id)).toEqual(['e2', 'e5']);
    expect(next[0]?.armband).toBe('2');
  });
});

describe('inRingReplicated', () => {
  it('finds the in-ring row via either alias', () => {
    expect(inRingReplicated([row({ id: 'e1', is_in_ring: true })])?.id).toBe('e1');
    expect(inRingReplicated([row({ id: 'e2', status: 'in-ring' })])?.id).toBe('e2');
  });

  it('returns null when no dog is in the ring', () => {
    expect(inRingReplicated([row({ id: 'e1', armband: '1' })])).toBeNull();
  });
});
