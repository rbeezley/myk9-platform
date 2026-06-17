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
