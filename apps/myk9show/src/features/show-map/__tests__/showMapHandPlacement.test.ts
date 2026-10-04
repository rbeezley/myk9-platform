/**
 * One model, two consumers (MYK9-972, round 3). The panel's rows and the
 * mutation's moves are built from the same slots, so for every fixture the
 * displayed order, the displayed pins and what a write accepts must agree.
 */
import { describe, expect, it } from 'vitest';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import type { ReplicatedArmband } from '@/services/replication/ReplicatedArmbandsTable';
import { buildClassPlacement, buildHandPlacementRows } from '../showMapHandPlacement';
import { movePlacement } from '../runOrderPlacementModel';

const e = (id: string, extra: Partial<ReplicatedEntry> = {}) =>
  ({
    id,
    dogId: `d-${id}`,
    entryStatus: 'confirmed',
    dogCallName: `Pup ${id}`,
    ...extra,
  }) as ReplicatedEntry;
const band = (armbandNumber: string, extra: Partial<ReplicatedArmband>) =>
  ({ armbandNumber, isAvailable: false, ...extra }) as ReplicatedArmband;

interface Fixture {
  name: string;
  entries: ReplicatedEntry[];
  armbands: ReplicatedArmband[];
  order: string[];
  pins: Record<string, 'already-ran' | 'in-ring'>;
}

const FIXTURES: Fixture[] = [
  {
    name: 'unassigned run orders, armbands from the armbands table, mixed pin signals',
    entries: [
      e('e1', { armband: '103' }),
      e('e2'), // armband only on the armbands table, by entry
      e('e3'), // armband only on the armbands table, by dog
      e('e4', { armband: '104', isInRing: true }), // boolean flag
      e('e5', { armband: '105', checkInStatus: 'completed' }),
      e('e6', { armband: '106', entryStatus: 'scratched' }), // off the run list
      e('e7', { armband: '107', check_in_status: 'in-ring' as never }),
      e('e8', { armband: '108', is_scored: true }),
      e('e9', { armband: '109', scoringCompletedAt: '2026-10-03T10:00:00Z' }),
      e('e10', { armband: '110', ring_entry_time: '2026-10-03T10:00:00Z' }),
    ],
    armbands: [band('101', { entryId: 'e2' }), band('102', { dogId: 'd-e3' })],
    order: ['e2', 'e3', 'e1', 'e4', 'e5', 'e7', 'e8', 'e9', 'e10'],
    pins: {
      e4: 'in-ring',
      e5: 'already-ran',
      e7: 'in-ring',
      e8: 'already-ran',
      e9: 'already-ran',
      e10: 'in-ring',
    },
  },
  {
    name: 'assigned run orders beat the armband fallback',
    entries: [
      e('a', { armband: '101', runOrder: 3 }),
      e('b', { armband: '150', runOrder: 1 }),
      e('c', { armband: '102', runOrder: 2, isScored: true }),
    ],
    armbands: [],
    order: ['b', 'c', 'a'],
    pins: { c: 'already-ran' },
  },
];

describe.each(FIXTURES)('$name', ({ entries, armbands, order, pins }) => {
  const placement = buildClassPlacement(entries, armbands);
  const rows = buildHandPlacementRows(placement);

  it('displays the run-queue order, run list only', () => {
    expect(rows.map(r => r.id)).toEqual(order);
  });

  it('displays exactly the pins the model enforces', () => {
    expect(Object.fromEntries(rows.filter(r => r.pinned).map(r => [r.id, r.pinned]))).toEqual(pins);
    expect(
      Object.fromEntries(placement.slots.filter(s => s.pinned).map(s => [s.id, s.pinned]))
    ).toEqual(pins);
  });

  it('a write accepts exactly the moves the rows offer', () => {
    for (const row of rows) {
      for (const slot of placement.slots) {
        const offered = row.destinations.includes(slot.position);
        const accepted = movePlacement(placement.slots, row.id, slot.position).length > 0;
        // A no-op to the dog's own slot is neither offered nor written.
        expect({ id: row.id, to: slot.position, accepted }).toEqual({
          id: row.id,
          to: slot.position,
          accepted: offered,
        });
      }
    }
  });

  it('a move leaves every pinned dog in its slot', () => {
    const open = rows.filter(r => !r.pinned);
    if (open.length < 2) return;
    const from = open[open.length - 1]!;
    const to = open[0]!;
    const changes = movePlacement(placement.slots, from.id, to.position);
    expect(changes.length).toBeGreaterThan(0);
    const after = buildClassPlacement(
      entries.map(entry => {
        const change = changes.find(c => c.id === entry.id);
        return change ? { ...entry, runOrder: change.runOrder } : entry;
      }),
      armbands
    );
    expect(after.slots[to.position - 1]!.id).toBe(from.id);
    for (const slot of placement.slots.filter(s => s.pinned)) {
      expect(after.slots[slot.position - 1]!.id).toBe(slot.id);
    }
  });
});
