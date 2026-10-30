/**
 * Tests for run-order preset translation + calculation.
 *
 * Regression focus: the at-show "Randomize All" button emits ringside's
 * `random-all`, which myK9Show's calculateRunOrder does not handle — a bare cast
 * let it fall through to the deterministic armband-ascending default. The
 * boundary translator toMyK9ShowRunOrderPreset must map it to `random`.
 */

import { describe, expect, it } from 'vitest';
import { toMyK9ShowRunOrderPreset, calculateRunOrder } from './runOrderUtils';

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
