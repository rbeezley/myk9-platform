/**
 * Tests for run-order preset translation + calculation.
 *
 * Regression focus: the at-show "Randomize All" button emits ringside's
 * `random-all`, which myK9Show's calculateRunOrder does not handle — a bare cast
 * let it fall through to the deterministic armband-ascending default. The
 * boundary translator toMyK9ShowRunOrderPreset must map it to `random`.
 */

import { describe, expect, it } from 'vitest';
import {
  toMyK9ShowRunOrderPreset,
  calculateRunOrder,
  calculateRunOrderScoped,
  calculateManualScopedRunOrder,
  storedRunOrder,
} from './runOrderUtils';

describe('toMyK9ShowRunOrderPreset', () => {
  it('maps ringside random-all → myK9Show random (the bug fix)', () => {
    expect(toMyK9ShowRunOrderPreset('random-all')).toBe('random');
  });

  it('passes through supported presets unchanged', () => {
    for (const p of [
      'armband-asc',
      'armband-desc',
      'combined-asc',
      'combined-desc',
      'random',
      'manual',
      'random-sections',
      'a-then-b-asc',
      'a-then-b-desc',
      'b-then-a-asc',
      'b-then-a-desc',
    ] as const) {
      expect(toMyK9ShowRunOrderPreset(p)).toBe(p);
    }
  });
});

describe('calculateRunOrder via the translated preset', () => {
  const entries = [
    { id: 'e3', armband: '3' },
    { id: 'e1', armband: '1' },
    { id: 'e2', armband: '2' },
  ];

  it('armband-asc numbers entries by ascending armband', () => {
    const result = calculateRunOrder(entries, toMyK9ShowRunOrderPreset('armband-asc'));
    expect(result).toEqual([
      { id: 'e1', runOrder: 1 },
      { id: 'e2', runOrder: 2 },
      { id: 'e3', runOrder: 3 },
    ]);
  });

  it('random-all (→ random) returns a complete, valid permutation', () => {
    const result = calculateRunOrder(entries, toMyK9ShowRunOrderPreset('random-all'));
    // Every entry present exactly once with a contiguous 1..n run order — the
    // proof it went through the shuffle branch, not a dropped/empty result.
    expect(result.map(r => r.id).sort()).toEqual(['e1', 'e2', 'e3']);
    expect(result.map(r => r.runOrder).sort()).toEqual([1, 2, 3]);
  });
});

describe('storedRunOrder', () => {
  it('reads 0, null and undefined as unset and keeps real slots', () => {
    expect(storedRunOrder({ exhibitorOrder: 0 })).toBeNull();
    expect(storedRunOrder({ exhibitorOrder: null })).toBeNull();
    expect(storedRunOrder({})).toBeNull();
    expect(storedRunOrder({ exhibitorOrder: 3 })).toBe(3);
  });
});

describe('calculateRunOrderScoped preserve with an unset stored order', () => {
  it('never returns runOrder 0 for entries the adapter exposes as exhibitorOrder 0', () => {
    // transformEntry exposes an unset run_order as 0; callers convert via storedRunOrder.
    const adapterEntries = [
      { id: 'a1', armband: '101', section: 'A', exhibitorOrder: 0 },
      { id: 'a2', armband: '102', section: 'A', exhibitorOrder: 0 },
      { id: 'b1', armband: '201', section: 'B', exhibitorOrder: 4 },
    ];
    const result = calculateRunOrderScoped(
      adapterEntries.map(e => ({
        id: e.id,
        armband: e.armband,
        section: e.section,
        runOrder: storedRunOrder(e),
      })),
      'armband-asc',
      'A',
      'preserve'
    );
    expect(result).toEqual([
      { id: 'a1', runOrder: 5 },
      { id: 'a2', runOrder: 6 },
    ]);
    expect(result.every(r => r.runOrder > 0)).toBe(true);
  });

  it('never writes 0 for one unset entry beside a real slot in the same section', () => {
    // A lone unset order next to a real one: read as 0 it would be a distinct,
    // usable slot, so preserve would write 0 back (the MYK9-1530 hazard).
    const adapterEntries = [
      { id: 'a1', armband: '101', section: 'A', exhibitorOrder: 0 },
      { id: 'a2', armband: '102', section: 'A', exhibitorOrder: 2 },
      { id: 'b1', armband: '201', section: 'B', exhibitorOrder: 1 },
    ];
    const result = calculateRunOrderScoped(
      adapterEntries.map(e => ({
        id: e.id,
        armband: e.armband,
        section: e.section,
        runOrder: storedRunOrder(e),
      })),
      'armband-asc',
      'A',
      'preserve'
    );
    expect(result.map(r => r.id).sort()).toEqual(['a1', 'a2']);
    expect(result.every(r => r.runOrder > 0)).toBe(true);
  });
});

describe('calculateManualScopedRunOrder', () => {
  const entries = [
    { id: 'a1', armband: '101', section: 'A', runOrder: 1 },
    { id: 'b1', armband: '201', section: 'B', runOrder: 2 },
    { id: 'a2', armband: '102', section: 'A', runOrder: 3 },
    { id: 'b2', armband: '202', section: 'B', runOrder: 4 },
  ];

  it('preserve: reorders A within its own slots and never writes B', () => {
    expect(calculateManualScopedRunOrder(entries, 'A', ['a2', 'a1'], 'preserve')).toEqual([
      { id: 'a2', runOrder: 1 },
      { id: 'a1', runOrder: 3 },
    ]);
  });

  it('renumber: A first in the dragged order, then B in its current order', () => {
    expect(calculateManualScopedRunOrder(entries, 'A', ['a2', 'a1'], 'renumber')).toEqual([
      { id: 'a2', runOrder: 1 },
      { id: 'a1', runOrder: 2 },
      { id: 'b1', runOrder: 3 },
      { id: 'b2', runOrder: 4 },
    ]);
  });

  it('ignores ids from the other section and keeps undragged section entries last', () => {
    expect(calculateManualScopedRunOrder(entries, 'A', ['b1', 'a2'], 'renumber')).toEqual([
      { id: 'a2', runOrder: 1 },
      { id: 'a1', runOrder: 2 },
      { id: 'b1', runOrder: 3 },
      { id: 'b2', runOrder: 4 },
    ]);
  });
});
