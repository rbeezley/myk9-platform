/** MYK9-1102: every scoring route reads the class rule's 30-second warning. */
import { describe, it, expect } from 'vitest';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';
import { classScoringRules, classTimerMode } from './classScoringRules';
import { classRequirementsFromClass } from '@/features/at-show/slots/classRequirementsFromClass';

const base = { id: 'c', name: 'HD Master', element: 'Handler Discrimination', level: 'Master' };

describe('classScoringRules', () => {
  it("uses the current rule's warning, even where the level would say otherwise", () => {
    const cls = {
      ...base,
      timeLimitRule: { thirtySecondWarning: true, forElement: base.element, forLevel: base.level },
    } as ReplicatedClass;
    expect(classScoringRules(cls).thirtySecondWarning).toBe(true);
  });

  it('ignores a rule cached for another element or level', () => {
    const cls = {
      ...base,
      timeLimitRule: { thirtySecondWarning: true, forElement: 'Interior', forLevel: 'Master' },
    } as ReplicatedClass;
    expect(classScoringRules(cls).thirtySecondWarning).toBeUndefined();
  });

  describe('timer mode (MYK9-2016): the sheet and the class info panel read one answer', () => {
    const display = {
      hideFixed: null,
      hideMin: null,
      hideMax: null,
      hidesKnown: true,
      distractionMin: null,
      distractionMax: null,
      areaCount: 1,
      hasBlank: false,
      odors: [],
    };
    const withRule = (ruleMode: string, classMode: string | undefined) =>
      ({
        ...base,
        timerMode: classMode,
        timeLimitRule: {
          forElement: base.element,
          forLevel: base.level,
          display: { ...display, timerMode: ruleMode },
        },
      }) as ReplicatedClass;

    it("reads the current rule's mode over the class's copy", () => {
      const cls = withRule('dual', 'single');
      expect(classScoringRules(cls).timerMode).toBe('dual');
      expect(classRequirementsFromClass(cls, 'UKC').timer_mode).toBe('dual');
    });

    it("falls back to the class's own mode with no current rule", () => {
      const cls = {
        ...base,
        timerMode: 'dual',
        timeLimitRule: { forElement: 'Interior', forLevel: 'Master', display: undefined },
      } as ReplicatedClass;
      expect(classTimerMode(cls)).toBe('dual');
      expect(classScoringRules(cls).timerMode).toBe('dual');
      expect(classRequirementsFromClass(cls, 'UKC').timer_mode).toBe('dual');
    });

    it('is single when neither says', () => {
      const cls = { ...base } as ReplicatedClass;
      expect(classScoringRules(cls).timerMode).toBe('single');
      expect(classRequirementsFromClass(cls, 'UKC').timer_mode).toBe('single');
    });
  });
});
