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
      isEligibleMoveUpTarget(
        { element: null, level: 'Novice' },
        { element: 'Container', level: 'Advanced' }
      )
    ).toBe(false);
    expect(
      isEligibleMoveUpTarget(
        { element: 'Container', level: 'Novice' },
        { element: 'Container', level: null }
      )
    ).toBe(false);
    expect(isEligibleMoveUpTarget({}, {})).toBe(false);
  });
});

/**
 * Phase 5b bug fix: AKC's hardcoded level ladder used to gate isKnownLevel for every
 * registry, so UKC's 'Superior'/'Elite' and ASCA's 'Open'/'Champion' — none of which are
 * in AKC's ladder — were always rejected as "unknown", silently blocking every UKC/ASCA
 * move-up that touched those levels. Passing the trial's actual registry fixes it.
 */
describe('isEligibleMoveUpTarget — registry-aware (Phase 5b)', () => {
  it('without a registry arg (AKC default), UKC/ASCA-only levels are still rejected as unknown', () => {
    expect(
      isEligibleMoveUpTarget(
        { element: 'Container', level: 'Advanced' },
        { element: 'Container', level: 'Superior' }
      )
    ).toBe(false);
    expect(
      isEligibleMoveUpTarget(
        { element: 'Container', level: 'Advanced' },
        { element: 'Container', level: 'Open' }
      )
    ).toBe(false);
  });

  it('recognizes UKC Superior/Elite when passed the UKC registry', () => {
    expect(
      isEligibleMoveUpTarget(
        { element: 'Container', level: 'Advanced' },
        { element: 'Container', level: 'Superior' },
        'UKC'
      )
    ).toBe(true);
    expect(
      isEligibleMoveUpTarget(
        { element: 'Container', level: 'Superior' },
        { element: 'Container', level: 'Elite' },
        'UKC'
      )
    ).toBe(true);
    // Still rejects AKC-only 'Detective' under UKC.
    expect(
      isEligibleMoveUpTarget(
        { element: 'Container', level: 'Advanced' },
        { element: 'Container', level: 'Detective' },
        'UKC'
      )
    ).toBe(false);
  });

  it('recognizes ASCA Open as a higher level than Novice (Open is ASCA-only, unknown to AKC)', () => {
    expect(
      isEligibleMoveUpTarget(
        { element: 'Container', level: 'Novice' },
        { element: 'Container', level: 'Open' },
        'ASCA'
      )
    ).toBe(true);
    expect(
      isEligibleMoveUpTarget(
        { element: 'Container', level: 'Open' },
        { element: 'Container', level: 'Advanced' },
        'ASCA'
      )
    ).toBe(true);
    // Equal level (Open → Open) is not a move-up.
    expect(
      isEligibleMoveUpTarget(
        { element: 'Container', level: 'Open' },
        { element: 'Container', level: 'Open' },
        'ASCA'
      )
    ).toBe(false);
  });
});
