import { describe, expect, it } from 'vitest';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import { buildHandPlacementRows, computeHandPlacementChanges } from '../showMapHandPlacement';
import { computeShowMapAutoSortAssignments } from '../showMapRunOrderAutoSort';
import type { SecretaryEntry } from '@/services/database/entries';

function entry(id: string, runOrder: number | undefined, extra: Partial<ReplicatedEntry> = {}) {
  return { id, armband: String(100 + Number(id.slice(1))), runOrder, ...extra } as ReplicatedEntry;
}

// e1..e5 run in that order; e2 has already run (scored), e4 is in the ring.
const CLASS = [
  entry('e1', 1),
  entry('e2', 2, { isScored: true }),
  entry('e3', 3),
  entry('e4', 4, { checkInStatus: 'in-ring' }),
  entry('e5', 5),
];

const applied = (changes: ReturnType<typeof computeHandPlacementChanges>) =>
  Object.fromEntries(changes.map(change => [change.id, change.runOrder]));

describe('computeHandPlacementChanges', () => {
  it('moves one dog to a chosen slot and writes only the dogs that changed', () => {
    const open = [entry('e1', 1), entry('e2', 2), entry('e3', 3), entry('e4', 4)];
    const changes = computeHandPlacementChanges(open, 'e4', 1);
    expect(applied(changes)).toEqual({ e4: 1, e1: 2, e2: 3, e3: 4 });
    expect(changes.find(change => change.id === 'e4')?.priorRunOrder).toBe(4);
  });

  it('moving across a pinned dog leaves the pinned dog in its slot', () => {
    // e5 to slot 1: e1 and e3 shift down through the open slots; e2 (slot 2) and e4 (slot 4) stay.
    const changes = computeHandPlacementChanges(CLASS, 'e5', 1);
    expect(applied(changes)).toEqual({ e5: 1, e1: 3, e3: 5 });
  });

  it('refuses to move a dog that has run or is in the ring', () => {
    expect(computeHandPlacementChanges(CLASS, 'e2', 3)).toEqual([]);
    expect(computeHandPlacementChanges(CLASS, 'e4', 1)).toEqual([]);
  });

  it('refuses to put a dog into a pinned slot', () => {
    expect(computeHandPlacementChanges(CLASS, 'e1', 2)).toEqual([]);
    expect(computeHandPlacementChanges(CLASS, 'e1', 4)).toEqual([]);
  });

  it('is a no-op for the dog current slot, an unknown dog and an out-of-range slot', () => {
    expect(computeHandPlacementChanges(CLASS, 'e3', 3)).toEqual([]);
    expect(computeHandPlacementChanges(CLASS, 'nope', 1)).toEqual([]);
    expect(computeHandPlacementChanges(CLASS, 'e1', 9)).toEqual([]);
    expect(computeHandPlacementChanges(CLASS, 'e1', 1.5)).toEqual([]);
  });

  it('numbers positions over the run list only: a scratched dog is not a slot', () => {
    const withScratch = [
      entry('e1', 1),
      entry('e2', 2, { entryStatus: 'scratched' }),
      entry('e3', 3),
    ];
    expect(applied(computeHandPlacementChanges(withScratch, 'e3', 1))).toEqual({ e3: 1, e1: 2 });
  });

  it('a preset pressed after a hand move replaces the hand placement', () => {
    const open = [entry('e1', 1), entry('e2', 2), entry('e3', 3)];
    const afterMove = open.map(e => ({
      ...e,
      runOrder: applied(computeHandPlacementChanges(open, 'e3', 1))[e.id] ?? e.runOrder,
    }));
    expect(afterMove.find(e => e.id === 'e3')?.runOrder).toBe(1);
    const resorted = computeShowMapAutoSortAssignments(afterMove, 'armband-asc');
    expect(Object.fromEntries(resorted.map(a => [a.id, a.runOrder]))).toEqual({
      e1: 1,
      e2: 2,
      e3: 3,
    });
  });
});

function row(id: string, runOrder: number, extra: Partial<SecretaryEntry> = {}): SecretaryEntry {
  return {
    id,
    class_id: 'c1',
    run_order: runOrder,
    armband: String(100 + Number(id.slice(1))),
    entry_status: 'confirmed',
    handler: `Handler ${id}`,
    dog: { id: `d-${id}`, name: `Dog ${id}`, call_name: `Pup${id.slice(1)}` },
    ...extra,
  } as unknown as SecretaryEntry;
}

describe('buildHandPlacementRows', () => {
  const rows = buildHandPlacementRows(
    [
      row('e1', 1),
      row('e2', 2, { is_scored: true }),
      row('e3', 3),
      row('e4', 4, { is_in_ring: true }),
      row('e5', 5),
      row('x9', 6, { class_id: 'other' }),
      row('e6', 7, { entry_status: 'withdrawn' }),
    ],
    'c1'
  );

  it('lists this class run list in order, without other classes or removed dogs', () => {
    expect(rows.map(r => r.id)).toEqual(['e1', 'e2', 'e3', 'e4', 'e5']);
    expect(rows[0]).toMatchObject({ label: '#101 Pup1', subtitle: 'Handler e1', position: 1 });
  });

  it('says why a dog cannot move', () => {
    expect(rows.map(r => r.pinned)).toEqual([null, 'already-ran', null, 'in-ring', null]);
    expect(rows[1]).toMatchObject({ destinations: [], upTo: null, downTo: null });
  });

  it('steps up and down over pinned dogs to the next open slot', () => {
    expect(rows[2]).toMatchObject({ upTo: 1, downTo: 5, destinations: [1, 5] });
    expect(rows[0]).toMatchObject({ upTo: null, downTo: 3 });
    expect(rows[4]).toMatchObject({ upTo: 3, downTo: null });
  });
});

describe('entries with no run_order follow the canonical run-queue order', () => {
  // Ids sort opposite to armbands, so a UUID tie-break would disagree with ringside.
  const unassigned = [
    entry('e9', undefined, { armband: '103' }),
    entry('e8', undefined, { armband: '101' }),
    entry('e7', undefined, { armband: '102' }),
  ];

  it('numbers positions by armband, as runQueue does', () => {
    const rows = buildHandPlacementRows(
      unassigned.map(e => row(e.id, 0, { armband: e.armband, run_order: null })),
      'c1'
    );
    expect(rows.map(r => r.id)).toEqual(['e8', 'e7', 'e9']);
  });

  it('a move assigns numbers along that order', () => {
    const changes = computeHandPlacementChanges(unassigned, 'e9', 1);
    expect(applied(changes)).toEqual({ e9: 1, e8: 2, e7: 3 });
  });

  it('an assigned dog still sorts by its run_order among unassigned ones', () => {
    const mixed = [entry('e1', 1, { armband: '150' }), entry('e2', undefined, { armband: '101' })];
    // runOrder 1 vs armband fallback 101: the assigned dog runs first.
    expect(applied(computeHandPlacementChanges(mixed, 'e2', 1))).toEqual({ e2: 1, e1: 2 });
  });
});
