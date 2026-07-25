import { describe, it, expect } from 'vitest';
import {
  quickAdvanceCandidates,
  gatePromotedPending,
  gateRank,
  gateStatusLabel,
  hasAnyGateStatus,
  type QuickAdvanceEntry,
} from './quickAdvanceCandidates';
import { pendingByRunOrder } from './runQueue';

function entry(overrides: Partial<QuickAdvanceEntry> & { id: string }): QuickAdvanceEntry {
  return { armband: Number(overrides.id) || 0, ...overrides };
}

const noStatusClass: QuickAdvanceEntry[] = [
  entry({ id: '3', armband: 3, exhibitorOrder: 3 }),
  entry({ id: '1', armband: 1, exhibitorOrder: 1 }),
  entry({ id: '4', armband: 4, exhibitorOrder: 4 }),
  entry({ id: '2', armband: 2, exhibitorOrder: 2 }),
];

describe('quickAdvanceCandidates — no check-in status data (paper gate, the common case)', () => {
  it('returns the next three pending dogs in run order', () => {
    expect(quickAdvanceCandidates(noStatusClass).map(e => e.id)).toEqual(['1', '2', '3']);
  });

  it('is identical to pendingByRunOrder when no statuses exist', () => {
    expect(gatePromotedPending(noStatusClass)).toEqual(pendingByRunOrder(noStatusClass));
  });

  it('reports no gate statuses present', () => {
    expect(hasAnyGateStatus(noStatusClass)).toBe(false);
    expect(noStatusClass.every(e => gateRank(e) === 2)).toBe(true);
  });
});

describe('quickAdvanceCandidates — partial status data', () => {
  it('promotes at-gate ahead of come-to-gate, both ahead of plain pending', () => {
    const entries = [
      entry({ id: '1', armband: 1, exhibitorOrder: 1 }),
      entry({ id: '2', armband: 2, exhibitorOrder: 2 }),
      entry({ id: '3', armband: 3, exhibitorOrder: 3, checkInStatus: 'come-to-gate' }),
      entry({ id: '9', armband: 9, exhibitorOrder: 9, checkInStatus: 'at-gate' }),
    ];
    expect(quickAdvanceCandidates(entries).map(e => e.id)).toEqual(['9', '3', '1']);
  });

  it('keeps run order among equally ranked gate dogs', () => {
    const entries = [
      entry({ id: '7', armband: 7, exhibitorOrder: 7, checkInStatus: 'at-gate' }),
      entry({ id: '2', armband: 2, exhibitorOrder: 2, checkInStatus: 'at-gate' }),
      entry({ id: '1', armband: 1, exhibitorOrder: 1 }),
    ];
    expect(gatePromotedPending(entries).map(e => e.id)).toEqual(['2', '7', '1']);
  });

  it('reads ringside entries that carry the gate status on `status`', () => {
    const entries = [
      entry({ id: '1', armband: 1, exhibitorOrder: 1 }),
      entry({ id: '5', armband: 5, exhibitorOrder: 5, status: 'at-gate' }),
    ];
    expect(quickAdvanceCandidates(entries).map(e => e.id)).toEqual(['5', '1']);
  });
});

describe('quickAdvanceCandidates — queue exclusions and class end', () => {
  it('excludes the in-ring dog, scored dogs, and pulled dogs', () => {
    const entries = [
      entry({ id: '1', armband: 1, exhibitorOrder: 1, status: 'in-ring' }),
      entry({ id: '2', armband: 2, exhibitorOrder: 2, isScored: true }),
      entry({ id: '3', armband: 3, exhibitorOrder: 3, status: 'pulled' }),
      entry({ id: '4', armband: 4, exhibitorOrder: 4 }),
    ];
    expect(quickAdvanceCandidates(entries).map(e => e.id)).toEqual(['4']);
  });

  it('returns fewer than three when fewer remain', () => {
    const entries = [
      entry({ id: '1', armband: 1, exhibitorOrder: 1 }),
      entry({ id: '2', armband: 2, exhibitorOrder: 2 }),
    ];
    expect(quickAdvanceCandidates(entries)).toHaveLength(2);
  });

  it('returns nothing for the last dog in the class', () => {
    const entries = [entry({ id: '1', armband: 1, exhibitorOrder: 1, isScored: true })];
    expect(quickAdvanceCandidates(entries)).toEqual([]);
  });

  it('returns nothing for a non-positive limit', () => {
    expect(quickAdvanceCandidates(noStatusClass, 0)).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const snapshot = noStatusClass.map(e => e.id);
    quickAdvanceCandidates(noStatusClass);
    expect(noStatusClass.map(e => e.id)).toEqual(snapshot);
  });
});

describe('gateStatusLabel', () => {
  it('labels gate dogs and stays silent otherwise', () => {
    expect(gateStatusLabel(entry({ id: '1', checkInStatus: 'at-gate' }))).toBe('At gate');
    expect(gateStatusLabel(entry({ id: '2', checkInStatus: 'come-to-gate' }))).toBe(
      'Called to gate'
    );
    expect(gateStatusLabel(entry({ id: '3', checkInStatus: 'checked-in' }))).toBeNull();
    expect(gateStatusLabel(entry({ id: '4' }))).toBeNull();
  });
});
