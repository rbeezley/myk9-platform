import { describe, expect, it } from 'vitest';
import { isEligibleMoveUpTarget, type MoveUpClassIdentity } from './moveUpEligibility';
import type { RegistryId } from '@/features/registries';

/** Same-trial wrapper so the level/element cases below stay about level/element. */
function eligible(
  current: MoveUpClassIdentity,
  candidate: MoveUpClassIdentity,
  registryId?: RegistryId
): boolean {
  return isEligibleMoveUpTarget(
    { trialId: 't1', ...current },
    { trialId: 't1', ...candidate },
    registryId
  );
}

describe('isEligibleMoveUpTarget - trial scope (MYK9-920)', () => {
  const novice = { element: 'Container', level: 'Novice' };
  const advanced = { element: 'Container', level: 'Advanced' };

  it('rejects a higher same-element class in a DIFFERENT trial', () => {
    expect(
      isEligibleMoveUpTarget({ ...novice, trialId: 't1' }, { ...advanced, trialId: 't2' })
    ).toBe(false);
  });

  it('accepts the same class in the same trial, camelCase or snake_case', () => {
    expect(
      isEligibleMoveUpTarget({ ...novice, trialId: 't1' }, { ...advanced, trial_id: 't1' })
    ).toBe(true);
  });

  it('rejects when either trial is unknown', () => {
    expect(isEligibleMoveUpTarget(novice, { ...advanced, trialId: 't1' })).toBe(false);
    expect(isEligibleMoveUpTarget({ ...novice, trialId: 't1' }, advanced)).toBe(false);
  });
});

describe('isEligibleMoveUpTarget', () => {
  it('accepts a strictly higher level within the same element', () => {
    expect(
      eligible(
        { element: 'Container', level: 'Novice' },
        { element: 'Container', level: 'Advanced' }
      )
    ).toBe(true);
    expect(
      eligible({ element: 'Interior', level: 'Advanced' }, { element: 'Interior', level: 'Master' })
    ).toBe(true);
  });

  it('rejects an equal level', () => {
    expect(
      eligible({ element: 'Container', level: 'Novice' }, { element: 'Container', level: 'Novice' })
    ).toBe(false);
  });

  it('rejects a lower level', () => {
    expect(
      eligible({ element: 'Buried', level: 'Master' }, { element: 'Buried', level: 'Novice' })
    ).toBe(false);
  });

  it('rejects a different element even at a higher level (the F3 bug)', () => {
    expect(
      eligible({ element: 'Buried', level: 'Master' }, { element: 'Container', level: 'Novice' })
    ).toBe(false);
    expect(
      eligible(
        { element: 'Container', level: 'Novice' },
        { element: 'Interior', level: 'Excellent' }
      )
    ).toBe(false);
  });

  it('rejects an unknown/custom candidate level even from a known lower level', () => {
    // 999-rank sentinel must not read as "higher" than Novice.
    expect(
      eligible({ element: 'Container', level: 'Novice' }, { element: 'Container', level: 'Open' })
    ).toBe(false);
    expect(
      eligible(
        { element: 'Container', level: 'Novice' },
        { element: 'Container', level: 'Mastres' } // misspelling
      )
    ).toBe(false);
  });

  it('rejects when the current level is unknown', () => {
    expect(
      eligible({ element: 'Container', level: 'Open' }, { element: 'Container', level: 'Master' })
    ).toBe(false);
  });

  it("treats the 'Masters' plural alias as the canonical 'Master' level", () => {
    // Higher than Advanced → eligible.
    expect(
      eligible(
        { element: 'Interior', level: 'Advanced' },
        { element: 'Interior', level: 'Masters' }
      )
    ).toBe(true);
    // Equal to Master → not a move-up.
    expect(
      eligible({ element: 'Interior', level: 'Master' }, { element: 'Interior', level: 'Masters' })
    ).toBe(false);
  });

  it('rejects when either class lacks an element or level', () => {
    expect(
      eligible({ element: null, level: 'Novice' }, { element: 'Container', level: 'Advanced' })
    ).toBe(false);
    expect(
      eligible({ element: 'Container', level: 'Novice' }, { element: 'Container', level: null })
    ).toBe(false);
    expect(eligible({}, {})).toBe(false);
  });
});

/**
 * Phase 5b bug fix: AKC's hardcoded level ladder used to gate isKnownLevel for every
 * registry, so UKC's 'Superior'/'Elite' and ASCA's 'Open' — none of which are in AKC's
 * ladder — were always rejected as "unknown", silently blocking every UKC/ASCA move-up
 * that touched those levels. Passing the trial's actual registry fixes it.
 *
 * NOT fixed by this change: ASCA's Champion. It's a standalone terminal class with its
 * own element ('Champion') and no `level` field on real generated classes, so it can
 * never satisfy the same-element check regardless of registry — see the "Champion is
 * structurally unreachable" test below.
 */
describe('isEligibleMoveUpTarget — registry-aware (Phase 5b)', () => {
  it('without a registry arg (AKC default), UKC/ASCA-only levels are still rejected as unknown', () => {
    expect(
      eligible(
        { element: 'Container', level: 'Advanced' },
        { element: 'Container', level: 'Superior' }
      )
    ).toBe(false);
    expect(
      eligible({ element: 'Container', level: 'Advanced' }, { element: 'Container', level: 'Open' })
    ).toBe(false);
  });

  it('recognizes UKC Superior/Elite when passed the UKC registry', () => {
    expect(
      eligible(
        { element: 'Container', level: 'Advanced' },
        { element: 'Container', level: 'Superior' },
        'UKC'
      )
    ).toBe(true);
    expect(
      eligible(
        { element: 'Container', level: 'Superior' },
        { element: 'Container', level: 'Elite' },
        'UKC'
      )
    ).toBe(true);
    // Still rejects AKC-only 'Detective' under UKC.
    expect(
      eligible(
        { element: 'Container', level: 'Advanced' },
        { element: 'Container', level: 'Detective' },
        'UKC'
      )
    ).toBe(false);
  });

  it('recognizes ASCA Open as a higher level than Novice (Open is ASCA-only, unknown to AKC)', () => {
    expect(
      eligible(
        { element: 'Container', level: 'Novice' },
        { element: 'Container', level: 'Open' },
        'ASCA'
      )
    ).toBe(true);
    expect(
      eligible(
        { element: 'Container', level: 'Open' },
        { element: 'Container', level: 'Advanced' },
        'ASCA'
      )
    ).toBe(true);
    // Equal level (Open → Open) is not a move-up.
    expect(
      eligible(
        { element: 'Container', level: 'Open' },
        { element: 'Container', level: 'Open' },
        'ASCA'
      )
    ).toBe(false);
  });

  it('ASCA Champion is structurally unreachable via move-up, even with the ASCA registry', () => {
    // Real generated Champion classes carry element: 'Champion' and NO level field
    // (generateScentWorkClasses' standalone-class branch — see asca.ts) — never
    // `{ element: 'Container', level: 'Champion' }`. That fails the same-element
    // check against any Container/Interior/Exterior/Vehicle source regardless of
    // registry, and the missing level fails the element/level guard outright.
    expect(
      eligible(
        { element: 'Container', level: 'Excellent' },
        { element: 'Champion' }, // no level — matches the real generated shape
        'ASCA'
      )
    ).toBe(false);
  });
});
