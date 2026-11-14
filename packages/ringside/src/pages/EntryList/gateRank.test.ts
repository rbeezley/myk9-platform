import { describe, it, expect } from 'vitest';
import { gateRank, gateStatusOf, type GateRankEntry } from './gateRank';

function entry(overrides: Partial<GateRankEntry> & { id: string }): GateRankEntry {
  return { armband: Number(overrides.id) || 0, ...overrides };
}

describe('gateRank', () => {
  it('ranks every entry the same when no check-in status exists (paper gate)', () => {
    const entries = [entry({ id: '1' }), entry({ id: '2' }), entry({ id: '3' })];
    expect(entries.map(gateRank)).toEqual([2, 2, 2]);
  });

  it('ranks at-gate ahead of come-to-gate, both ahead of no signal', () => {
    expect(gateRank(entry({ id: '1', checkInStatus: 'at-gate' }))).toBe(0);
    expect(gateRank(entry({ id: '2', checkInStatus: 'come-to-gate' }))).toBe(1);
    expect(gateRank(entry({ id: '3' }))).toBe(2);
  });

  it('reads ringside entries that carry the gate status on `status`', () => {
    expect(gateStatusOf(entry({ id: '5', status: 'at-gate' }))).toBe('at-gate');
  });

  it('prefers the check-in axis over the lifecycle status', () => {
    expect(gateStatusOf(entry({ id: '6', checkInStatus: 'checked-in', status: 'at-gate' }))).toBe(
      null
    );
  });
});
