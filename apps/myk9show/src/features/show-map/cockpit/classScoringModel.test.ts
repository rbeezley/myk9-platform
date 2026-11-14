import { describe, expect, it } from 'vitest';

import { canSwitchScoring, isClassOnPaper, judgeScoringModel } from './classScoringModel';
import type { SecretaryCockpitClass } from './secretaryCockpitTypes';

const cls = (over: Partial<SecretaryCockpitClass>): SecretaryCockpitClass =>
  ({
    id: 'c',
    judgeId: 'j1',
    lifecycle: 'not-started',
    scoresOnPaper: null,
    ...over,
  }) as SecretaryCockpitClass;

describe('isClassOnPaper', () => {
  it('follows the class when it has a choice, else the show switch', () => {
    expect(isClassOnPaper(true, true)).toBe(true);
    expect(isClassOnPaper(false, false)).toBe(false);
    expect(isClassOnPaper(null, false)).toBe(true);
    expect(isClassOnPaper(null, true)).toBe(false);
  });

  it('does not read an unknown show switch as paper', () => {
    expect(isClassOnPaper(null, undefined)).toBe(false);
  });
});

describe('canSwitchScoring', () => {
  it('is off for complete and cancelled classes only', () => {
    expect(canSwitchScoring('complete')).toBe(false);
    expect(canSwitchScoring('cancelled')).toBe(false);
    expect(canSwitchScoring('in-progress')).toBe(true);
    expect(canSwitchScoring('not-started')).toBe(true);
    expect(canSwitchScoring(null)).toBe(true);
  });
});

describe('judgeScoringModel', () => {
  it('targets only that judge, and leaves over or cancelled classes alone', () => {
    const model = judgeScoringModel(
      [
        cls({ id: 'a' }),
        cls({ id: 'b', lifecycle: 'complete' }),
        cls({ id: 'c', lifecycle: 'cancelled' }),
        cls({ id: 'd', judgeId: 'j2' }),
        cls({ id: 'e', lifecycle: 'in-progress' }),
      ],
      'j1',
      true
    );
    expect(model.targets.map(c => c.id)).toEqual(['a', 'e']);
  });

  it('reads paper, phone and mixed against the show default', () => {
    const classes = [cls({ id: 'a', scoresOnPaper: true }), cls({ id: 'b' })];
    expect(judgeScoringModel(classes, 'j1', true).state).toBe('mixed');
    expect(judgeScoringModel(classes, 'j1', false).state).toBe('paper');
    expect(judgeScoringModel([cls({ id: 'b' })], 'j1', true).state).toBe('phone');
  });

  it('has no state when the judge has nothing to switch', () => {
    expect(judgeScoringModel([], 'j1', true).state).toBeNull();
  });
});
