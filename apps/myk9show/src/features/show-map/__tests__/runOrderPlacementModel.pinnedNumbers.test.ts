/**
 * A pinned dog's run_order is never written, and excluded rows (withdrawn,
 * deleted) ahead of it must not shift it. Hand placement and the presets share
 * `assignOpenSlots`, so both are held to the same rule (Codex P2 on #2722).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildRunOrderPlacementModel,
  movePlacement,
  type PlacementInput,
  type PlacementMove,
} from '../runOrderPlacementModel';
import { planPresetPlacement, type ShowMapAutoSortKind } from '../showMapRunOrderAutoSort';

afterEach(() => {
  vi.restoreAllMocks();
});

const dog = (
  id: string,
  armband: string,
  runOrder: number | null,
  extra: Partial<PlacementInput> = {}
) => ({ id, armband, runOrder, ...extra }) as PlacementInput;

function applyMoves(inputs: PlacementInput[], moves: PlacementMove[]): PlacementInput[] {
  const byId = new Map(moves.map(m => [m.id, m.runOrder]));
  return inputs.map(i => (byId.has(i.id) ? { ...i, runOrder: byId.get(i.id)! } : i));
}
const finalOrder = (inputs: PlacementInput[], moves: PlacementMove[]) =>
  buildRunOrderPlacementModel(applyMoves(inputs, moves)).map(s => s.id);

// Codex's example: a(1), withdrawn(2), scored(3), c(4).
const codex = (aArm: string, cArm: string) => [
  dog('a', aArm, 1),
  dog('w', '99', 2, { entryStatus: 'withdrawn' }),
  dog('s', '50', 3, { isScored: true }),
  dog('c', cArm, 4),
];

describe.each<
  [string, () => { inputs: PlacementInput[]; run: (i: PlacementInput[]) => PlacementMove[] }]
>([
  [
    'armband-asc',
    () => ({
      inputs: codex('30', '10'),
      run: i => planPresetPlacement(buildRunOrderPlacementModel(i), 'armband-asc'),
    }),
  ],
  [
    'armband-desc',
    () => ({
      inputs: codex('10', '30'),
      run: i => planPresetPlacement(buildRunOrderPlacementModel(i), 'armband-desc'),
    }),
  ],
  [
    'hand move',
    () => ({
      inputs: codex('30', '10'),
      run: i => movePlacement(buildRunOrderPlacementModel(i), 'c', 1),
    }),
  ],
])('%s across an excluded row', (_n, make) => {
  it('never writes the pinned dog and keeps it between the open dogs', () => {
    const { inputs, run } = make();
    const moves = run(inputs);
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.map(m => m.id)).not.toContain('s');
    const order = finalOrder(inputs, moves);
    expect(order.indexOf('s')).toBe(1);
    expect(order.sort()).toEqual(['a', 'c', 's']);
  });
});

it('random never writes the pinned dog', () => {
  for (const r of [0.01, 0.99, 0.5]) {
    vi.spyOn(Math, 'random').mockReturnValue(r);
    const inputs = codex('30', '10');
    const moves = planPresetPlacement(buildRunOrderPlacementModel(inputs), 'random');
    expect(moves.map(m => m.id)).not.toContain('s');
    expect(finalOrder(inputs, moves).indexOf('s')).toBe(1);
  }
});

describe.each(['armband-asc', 'armband-desc'] as ShowMapAutoSortKind[])(
  'a pinned dog after several excluded rows (%s)',
  kind => {
    const inputs = [
      dog('a', kind === 'armband-asc' ? '30' : '10', 1),
      dog('w1', '90', 2, { entryStatus: 'withdrawn' }),
      dog('w2', '91', 3, { deletedAt: '2026-10-01T00:00:00Z' }),
      dog('w3', '92', 4, { entryStatus: 'withdrawn' }),
      dog('s', '50', 5, { isInRing: true }),
      dog('c', '20', 6),
      dog('d', kind === 'armband-asc' ? '10' : '30', 7),
    ];
    it('writes no pinned id and leaves the pinned dog where it was', () => {
      const moves = planPresetPlacement(buildRunOrderPlacementModel(inputs), kind);
      expect(moves.length).toBeGreaterThan(0);
      expect(moves.map(m => m.id)).not.toContain('s');
      const order = finalOrder(inputs, moves);
      expect(order.indexOf('s')).toBe(1);
      expect(order).toEqual(['d', 's', 'c', 'a']);
    });
  }
);

it('a pinned dog with no run_order is never written', () => {
  const inputs = [dog('a', '30', 1), dog('s', '50', null, { isScored: true }), dog('c', '10', 2)];
  const moves = planPresetPlacement(buildRunOrderPlacementModel(inputs), 'armband-asc');
  expect(moves.map(m => m.id)).not.toContain('s');
});

it('never hands an open dog a number a pinned dog holds', () => {
  // Duplicate run_orders (a, b both 1) would walk b onto the scored dog's 2.
  const inputs = [dog('a', '10', 1), dog('b', '20', 1), dog('s', '50', 2, { isScored: true })];
  const moves = planPresetPlacement(buildRunOrderPlacementModel(inputs), 'armband-desc');
  expect(moves.map(m => m.runOrder)).not.toContain(2);
  expect(moves.map(m => m.id)).not.toContain('s');
});
