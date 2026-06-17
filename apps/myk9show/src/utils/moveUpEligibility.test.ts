import { describe, expect, it } from 'vitest';
import { isEligibleMoveUpTarget } from './moveUpEligibility';

describe('isEligibleMoveUpTarget', () => {
  it('accepts a strictly higher level within the same element', () => {
    expect(
      isEligibleMoveUpTarget(
        { element: 'Container', level: 'Novice' },
        { element: 'Container', level: 'Advanced' }
      )
    ).toBe(true);
    expect(
      isEligibleMoveUpTarget(
        { element: 'Interior', level: 'Advanced' },
        { element: 'Interior', level: 'Master' }
      )
    ).toBe(true);
  });

  it('rejects an equal level', () => {
    expect(
      isEligibleMoveUpTarget(
        { element: 'Container', level: 'Novice' },
        { element: 'Container', level: 'Novice' }
      )
    ).toBe(false);
  });

  it('rejects a lower level', () => {
    expect(
      isEligibleMoveUpTarget(
        { element: 'Buried', level: 'Master' },
        { element: 'Buried', level: 'Novice' }
      )
    ).toBe(false);
  });

  it('rejects a different element even at a higher level (the F3 bug)', () => {
    expect(
      isEligibleMoveUpTarget(
        { element: 'Buried', level: 'Master' },
        { element: 'Container', level: 'Novice' }
      )
    ).toBe(false);
    expect(
      isEligibleMoveUpTarget(
        { element: 'Container', level: 'Novice' },
        { element: 'Interior', level: 'Excellent' }
      )
    ).toBe(false);
  });

  it('rejects an unknown/custom candidate level even from a known lower level', () => {
    // 999-rank sentinel must not read as "higher" than Novice.
    expect(
      isEligibleMoveUpTarget(
        { element: 'Container', level: 'Novice' },
        { element: 'Container', level: 'Open' }
      )
    ).toBe(false);
    expect(
      isEligibleMoveUpTarget(
        { element: 'Container', level: 'Novice' },
        { element: 'Container', level: 'Mastres' } // misspelling
      )
    ).toBe(false);
  });

  it('rejects when the current level is unknown', () => {
    expect(
      isEligibleMoveUpTarget(
        { element: 'Container', level: 'Open' },
        { element: 'Container', level: 'Master' }
      )
    ).toBe(false);
  });

  it("treats the 'Masters' plural alias as the canonical 'Master' level", () => {
    // Higher than Advanced → eligible.
    expect(
      isEligibleMoveUpTarget(
        { element: 'Interior', level: 'Advanced' },
        { element: 'Interior', level: 'Masters' }
      )
    ).toBe(true);
    // Equal to Master → not a move-up.
    expect(
      isEligibleMoveUpTarget(
        { element: 'Interior', level: 'Master' },
        { element: 'Interior', level: 'Masters' }
      )
    ).toBe(false);
  });

  it('rejects when either class lacks an element or level', () => {
    expect(
      isEligibleMoveUpTarget({ element: null, level: 'Novice' }, { element: 'Container', level: 'Advanced' })
    ).toBe(false);
    expect(
      isEligibleMoveUpTarget({ element: 'Container', level: 'Novice' }, { element: 'Container', level: null })
    ).toBe(false);
    expect(isEligibleMoveUpTarget({}, {})).toBe(false);
  });
});
