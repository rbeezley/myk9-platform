/**
 * MYK9-990 round 3 (owner design): the run number IS the run order, and only
 * dogs still waiting to run are reorderable. A write renumbers the waiting dogs
 * consecutively from (highest run_order held by any other dog, or 0) + 1.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import { pendingReplicatedByRunOrder } from '@/features/at-show/replicatedRunQueue';
import { isOnClassRunList } from '@/features/_shared/entryAccounting';
import { buildClassPlacement, buildHandPlacementSections } from '../showMapHandPlacement';
import { movePlacement, type PlacementMove } from '../runOrderPlacementModel';
import { planPresetPlacement, type ShowMapAutoSortKind } from '../showMapRunOrderAutoSort';

afterEach(() => {
  vi.restoreAllMocks();
});

const e = (
  id: string,
  armband: string,
  runOrder: number | null,
  extra: Partial<ReplicatedEntry> = {}
) => ({ id, armband, runOrder, entryStatus: 'confirmed', ...extra }) as ReplicatedEntry;

const modelOf = (entries: ReplicatedEntry[]) => buildClassPlacement(entries, []).model;
const apply = (entries: ReplicatedEntry[], moves: readonly PlacementMove[]) =>
  entries.map(entry => {
    const move = moves.find(m => m.id === entry.id);
    return move ? ({ ...entry, runOrder: move.runOrder } as ReplicatedEntry) : entry;
  });
/** The waiting order the rest of the app sees (the canonical queue). */
const queueOrder = (entries: ReplicatedEntry[]) =>
  pendingReplicatedByRunOrder(entries.filter(isOnClassRunList)).map(x => x.id);
const panelOrder = (entries: ReplicatedEntry[]) =>
  buildHandPlacementSections(buildClassPlacement(entries, [])).waiting.map(r => r.id);

const PRESETS: ShowMapAutoSortKind[] = ['armband-asc', 'armband-desc'];
const writes = (moves: PlacementMove[]) => Object.fromEntries(moves.map(m => [m.id, m.runOrder]));

describe('Codex round 1: a(1), withdrawn(2), scored(3), c(4)', () => {
  const entries = [
    e('a', '30', 1),
    e('w', '99', 2, { entryStatus: 'withdrawn' }),
    e('s', '50', 3, { isScored: true }),
    e('c', '10', 4),
  ];

  it('armband-asc renumbers the two waiting dogs after the highest other number', () => {
    const moves = planPresetPlacement(modelOf(entries), 'armband-asc');
    expect(writes(moves)).toEqual({ a: 5 }); // c(10) first at 4 (unchanged), a after it
    expect(queueOrder(apply(entries, moves))).toEqual(['c', 'a']);
  });

  it('armband-desc', () => {
    const moves = planPresetPlacement(modelOf(entries), 'armband-desc');
    expect(writes(moves)).toEqual({ a: 4, c: 5 });
    expect(queueOrder(apply(entries, moves))).toEqual(['a', 'c']);
  });

  it('a hand move', () => {
    const moves = movePlacement(modelOf(entries), 'c', 1);
    expect(writes(moves)).toEqual({ a: 5 });
    expect(queueOrder(apply(entries, moves))).toEqual(['c', 'a']);
  });
});

describe('Codex round 2', () => {
  it('unnumbered scored dog with a low armband is not waiting and is never written', () => {
    const entries = [e('a', '20', null), e('s', '5', null, { isScored: true }), e('c', '10', null)];
    const moves = planPresetPlacement(modelOf(entries), 'armband-asc');
    expect(writes(moves)).toEqual({ c: 1, a: 2 });
    expect(queueOrder(apply(entries, moves))).toEqual(['c', 'a']);
  });

  it('duplicate numbers before a scored dog: a=1, b=1, s=2', () => {
    const entries = [e('a', '10', 1), e('b', '20', 1), e('s', '50', 2, { isScored: true })];
    const moves = planPresetPlacement(modelOf(entries), 'armband-desc');
    expect(writes(moves)).toEqual({ b: 3, a: 4 });
    expect(moves.map(m => m.id)).not.toContain('s');
    expect(queueOrder(apply(entries, moves))).toEqual(['b', 'a']);
  });
});

describe('returning and pulled dogs', () => {
  it('a dog that returns (un-pulled) sorts by its old number and is renumbered on the next reorder', () => {
    const entries = [e('a', '10', 1), e('p', '20', 2), e('c', '30', 5)];
    expect(modelOf(entries).waiting.map(r => r.id)).toEqual(['a', 'p', 'c']);
    const moves = movePlacement(modelOf(entries), 'c', 1);
    expect(writes(moves)).toEqual({ c: 1, a: 2, p: 3 });
  });

  it('a pulled dog is not waiting; the base number skips past its higher number', () => {
    const entries = [
      e('a', '10', 1),
      e('b', '20', 2),
      e('p', '30', 7, { checkInStatus: 'pulled' }),
    ];
    const model = modelOf(entries);
    expect(model.waiting.map(r => r.id)).toEqual(['a', 'b']);
    expect(model.finished.map(r => r.id)).toEqual(['p']);
    const moves = planPresetPlacement(model, 'armband-asc');
    expect(writes(moves)).toEqual({ a: 8, b: 9 });
    expect(moves.map(m => m.id)).not.toContain('p');
  });
});

describe('what waits', () => {
  const SIGNALS: Array<[string, Partial<ReplicatedEntry>, 'inRing' | 'finished']> = [
    ['isScored', { isScored: true }, 'finished'],
    ['is_scored', { is_scored: true }, 'finished'],
    ['scoringCompletedAt', { scoringCompletedAt: '2026-10-04T10:00:00Z' }, 'finished'],
    ['scoring_completed_at', { scoring_completed_at: '2026-10-04T10:00:00Z' }, 'finished'],
    ['check-in completed', { checkInStatus: 'completed' }, 'finished'],
    ['check-in pulled', { checkInStatus: 'pulled' }, 'finished'],
    ['check-in in-ring', { checkInStatus: 'in-ring' }, 'inRing'],
    ['check_in_status in-ring', { check_in_status: 'in-ring' } as never, 'inRing'],
    ['isInRing', { isInRing: true }, 'inRing'],
    ['is_in_ring', { is_in_ring: true }, 'inRing'],
    ['ring_entry_time', { ring_entry_time: '2026-10-04T10:00:00Z' }, 'inRing'],
  ];

  it.each(SIGNALS)('%s is not waiting', (_n, signal, section) => {
    const entries = [e('a', '10', 1), e('x', '20', 2, signal), e('c', '30', 3)];
    const model = modelOf(entries);
    expect(model.waiting.map(r => r.id)).toEqual(['a', 'c']);
    expect(model[section].map(r => r.id)).toEqual(['x']);
  });

  it('rows off the run list appear in no section, but their numbers still count toward the base', () => {
    const entries = [
      e('a', '10', 1),
      e('w', '20', 8, { entryStatus: 'withdrawn' }),
      e('d', '30', 9, { deletedAt: '2026-10-01T00:00:00Z' }),
    ];
    const model = modelOf(entries);
    expect([...model.waiting, ...model.inRing, ...model.finished].map(r => r.id)).toEqual(['a']);
    expect(model.baseRunOrder).toBe(9);
  });

  it('matches the canonical run queue for the signals it already reads', () => {
    const entries = [
      e('a', '40', 3),
      e('b', '30', 1),
      e('c', '20', 2, { is_scored: true }),
      e('d', '10', 4, { isInRing: true }),
      e('f', '50', 5, { checkInStatus: 'pulled' }),
      e('g', '60', null),
      e('h', '5', null, { entryStatus: 'withdrawn' }),
    ];
    expect(modelOf(entries).waiting.map(r => r.id)).toEqual(queueOrder(entries));
  });

  it('shows 1..N positions in the panel, not the stored numbers', () => {
    const entries = [e('a', '10', 12), e('b', '20', 40), e('c', '30', 41)];
    const rows = buildHandPlacementSections(buildClassPlacement(entries, [])).waiting;
    expect(rows.map(r => [r.id, r.position])).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);
    expect(rows[1]!.destinations).toEqual([1, 3]);
  });
});

describe('a write never touches a dog that is not waiting', () => {
  const entries = [
    e('a', '90', 1),
    e('b', '80', 2),
    e('c', '70', 3),
    e('done', '1', 9, { isScored: true }),
    e('ring', '2', 10, { isInRing: true }),
    e('pull', '3', 11, { checkInStatus: 'pulled' }),
    e('off', '4', 12, { entryStatus: 'withdrawn' }),
    e('gone', '5', 13, { deletedAt: '2026-10-01T00:00:00Z' }),
  ];
  const notWaiting = ['done', 'ring', 'pull', 'off', 'gone'];

  it.each(PRESETS)('%s', kind => {
    const moves = planPresetPlacement(modelOf(entries), kind);
    expect(moves.length).toBeGreaterThan(0);
    for (const id of notWaiting) expect(moves.map(m => m.id)).not.toContain(id);
    const after = apply(entries, moves);
    expect(queueOrder(after)).toEqual(panelOrder(after));
    expect(queueOrder(after)).toEqual(kind === 'armband-asc' ? ['c', 'b', 'a'] : ['a', 'b', 'c']);
    // Consecutive from the highest number any other dog holds.
    expect(modelOf(after).waiting.map(r => r.runOrder)).toEqual([14, 15, 16]);
  });

  it('random', () => {
    for (const r of [0.01, 0.5, 0.99]) {
      vi.spyOn(Math, 'random').mockReturnValue(r);
      const moves = planPresetPlacement(modelOf(entries), 'random');
      for (const id of notWaiting) expect(moves.map(m => m.id)).not.toContain(id);
      const after = apply(entries, moves);
      expect(queueOrder(after)).toEqual(panelOrder(after));
      expect(modelOf(after).waiting.map(x => x.runOrder)).toEqual([14, 15, 16]);
    }
  });

  it('a hand move, and the panel then shows the new queue order', () => {
    const moves = movePlacement(modelOf(entries), 'c', 1);
    for (const id of notWaiting) expect(moves.map(m => m.id)).not.toContain(id);
    const after = apply(entries, moves);
    expect(queueOrder(after)).toEqual(['c', 'a', 'b']);
    expect(panelOrder(after)).toEqual(['c', 'a', 'b']);
  });

  it('refuses a dog that is not waiting, a no-op and an out-of-range place', () => {
    const model = modelOf(entries);
    expect(movePlacement(model, 'done', 1)).toEqual([]);
    expect(movePlacement(model, 'ring', 2)).toEqual([]);
    expect(movePlacement(model, 'a', 1)).toEqual([]);
    expect(movePlacement(model, 'a', 4)).toEqual([]);
    expect(movePlacement(model, 'a', 0)).toEqual([]);
  });

  it('plans nothing when no dog is waiting', () => {
    const none = [e('s', '1', 1, { isScored: true })];
    expect(planPresetPlacement(modelOf(none), 'armband-asc')).toEqual([]);
  });
});
