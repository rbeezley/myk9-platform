import { describe, expect, it } from 'vitest';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import { buildClassPlacement } from '../showMapHandPlacement';
import { planPresetPlacement } from '../showMapRunOrderAutoSort';

function entry(overrides: Partial<ReplicatedEntry>): ReplicatedEntry {
  return { id: 'entry-x', ...overrides } as ReplicatedEntry;
}

const slotsFor = (entries: ReplicatedEntry[]) => buildClassPlacement(entries, []).slots;
const plan = (entries: ReplicatedEntry[], kind: Parameters<typeof planPresetPlacement>[1]) =>
  planPresetPlacement(slotsFor(entries), kind).map(({ id, runOrder }) => ({ id, runOrder }));

describe('planPresetPlacement', () => {
  const base = [
    entry({ id: 'a', armband: '30', runOrder: 1 }),
    entry({ id: 'b', armband: '10', runOrder: 2 }),
    entry({ id: 'c', armband: '20', runOrder: 3 }),
  ];

  it('plans nothing for an empty class', () => {
    expect(plan([], 'armband-asc')).toEqual([]);
  });

  it('sorts ascending by armband', () => {
    expect(plan(base, 'armband-asc')).toEqual([
      { id: 'b', runOrder: 1 },
      { id: 'c', runOrder: 2 },
      { id: 'a', runOrder: 3 },
    ]);
  });

  it('sorts descending by armband, writing only dogs that move', () => {
    expect(plan(base, 'armband-desc')).toEqual([
      { id: 'c', runOrder: 2 },
      { id: 'b', runOrder: 3 },
    ]);
  });

  it('writes nothing when the order is already right', () => {
    const sorted = [
      entry({ id: 'b', armband: '10', runOrder: 1 }),
      entry({ id: 'c', armband: '20', runOrder: 2 }),
    ];
    expect(plan(sorted, 'armband-asc')).toEqual([]);
  });

  it('keeps a pinned dog in its slot and sorts the rest around it', () => {
    const entries = [
      entry({ id: 'a', armband: '30', runOrder: 1 }),
      entry({ id: 'b', armband: '10', runOrder: 2, isScored: true }),
      entry({ id: 'c', armband: '20', runOrder: 3 }),
      entry({ id: 'd', armband: '5', runOrder: 4 }),
    ];
    expect(plan(entries, 'armband-asc')).toEqual([
      { id: 'd', runOrder: 1 },
      { id: 'a', runOrder: 4 },
    ]);
  });

  it('treats a missing run_order as last', () => {
    const entries = [
      entry({ id: 'a', armband: '30' }),
      entry({ id: 'b', armband: '10', runOrder: 1 }),
      entry({ id: 'c', armband: '20', runOrder: 2 }),
    ];
    expect(plan(entries, 'armband-asc')).toEqual([{ id: 'a', runOrder: 3 }]);
  });

  it('random produces a permutation of the open dogs into the open slots', () => {
    const entries = Array.from({ length: 10 }, (_, i) =>
      entry({ id: `e${i}`, armband: String(i), runOrder: i + 1 })
    );
    const moved = plan(entries, 'random');
    const ids = moved.map(m => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of moved) expect(m.runOrder).toBeGreaterThanOrEqual(1);
    for (const m of moved) expect(m.runOrder).toBeLessThanOrEqual(10);
  });

  it('plans nothing when every dog is pinned', () => {
    const entries = [
      entry({ id: 'a', armband: '30', runOrder: 1, isScored: true }),
      entry({ id: 'b', armband: '10', runOrder: 2, isScored: true }),
    ];
    expect(plan(entries, 'armband-asc')).toEqual([]);
  });
});

// Parity with hand placement (MYK9-990): the preset trusts the placement
// model's pins, so every pin signal the model knows must also hold the dog still
// under a preset. One signal per row, none of them anything else.
const PIN_SIGNALS: Array<[string, Partial<ReplicatedEntry>]> = [
  ['isScored', { isScored: true }],
  ['is_scored', { is_scored: true }],
  ['scoringCompletedAt', { scoringCompletedAt: '2026-10-04T10:00:00Z' }],
  ['scoring_completed_at', { scoring_completed_at: '2026-10-04T10:00:00Z' }],
  ['checkInStatus completed', { checkInStatus: 'completed' }],
  ['check_in_status completed', { check_in_status: 'completed' }],
  ['checkInStatus in-ring', { checkInStatus: 'in-ring' }],
  ['check_in_status in-ring', { check_in_status: 'in-ring' }],
  ['isInRing', { isInRing: true }],
  ['is_in_ring', { is_in_ring: true }],
  ['ring_entry_time', { ring_entry_time: '2026-10-04T10:00:00Z' }],
] as Array<[string, Partial<ReplicatedEntry>]>;

describe.each(PIN_SIGNALS)('pin signal: %s', (_name, signal) => {
  const entries = [
    entry({ id: 'a', armband: '30', runOrder: 1 }),
    entry({ id: 'p', armband: '10', runOrder: 2, ...signal }),
    entry({ id: 'c', armband: '20', runOrder: 3 }),
    entry({ id: 'd', armband: '5', runOrder: 4 }),
  ];

  it('the placement model pins the dog', () => {
    expect(slotsFor(entries).find(s => s.id === 'p')?.pinned).toBeTruthy();
  });

  it.each(['armband-asc', 'armband-desc'] as const)('%s leaves it in its slot', kind => {
    const slots = slotsFor(entries);
    const changes = planPresetPlacement(slots, kind);
    expect(changes.map(c => c.id)).not.toContain('p');
    // Every move targets an open slot: none lands on the pinned dog's slot.
    const pinnedPosition = slots.find(s => s.id === 'p')!.position;
    expect(changes.map(c => c.runOrder)).not.toContain(pinnedPosition);
  });
});

describe('rows off the run list', () => {
  it('are neither moved nor written by a preset', () => {
    const entries = [
      entry({ id: 'a', armband: '30', runOrder: 1 }),
      entry({ id: 'w', armband: '10', runOrder: 2, entryStatus: 'withdrawn' }),
      entry({ id: 'c', armband: '20', runOrder: 3 }),
    ];
    expect(plan(entries, 'armband-asc')).toEqual([
      { id: 'c', runOrder: 1 },
      { id: 'a', runOrder: 2 },
    ]);
  });
});
