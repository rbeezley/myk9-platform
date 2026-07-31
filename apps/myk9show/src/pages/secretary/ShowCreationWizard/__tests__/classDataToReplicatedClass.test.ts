import { describe, it, expect } from 'vitest';
import { classDataToReplicatedClass } from '../classDataToReplicatedClass';
import type { ClassData } from '@/components/classes/types/classTypes';
import type { SportClassRuleRow } from '@/types/sport-template-types';

const baseClassData: ClassData = {
  id: 'class-1',
  trialId: 'trial-1',
  trial: 'Saturday Trial',
  trialDate: '2026-06-01',
  trialNumber: '1',
  classOrder: '1',
  status: 'Scheduled',
  judge: 'Jane Smith',
  element: 'Buried',
  level: 'Master',
  className: 'Buried Master',
};

function makeRule(rule: Partial<SportClassRuleRow>): SportClassRuleRow {
  return rule as SportClassRuleRow;
}

describe('classDataToReplicatedClass', () => {
  it('bakes hideCount from a fixed hide_count rule', () => {
    const result = classDataToReplicatedClass(
      baseClassData,
      makeRule({ hides_known: false, hide_count_fixed: 3 })
    );
    expect(result.hideCount).toBe(3);
  });

  it('leaves hideCount undefined for a banded hide_count rule so the judge sets it', () => {
    const result = classDataToReplicatedClass(
      baseClassData,
      makeRule({ hides_known: false, hide_count_fixed: null, hide_count_min: 2, hide_count_max: 3 })
    );
    expect(result.hideCount).toBeUndefined();
  });

  it('leaves hideCount undefined when no rule matched', () => {
    expect(classDataToReplicatedClass(baseClassData).hideCount).toBeUndefined();
  });

  it('still carries the other rule-derived scoring fields', () => {
    const result = classDataToReplicatedClass(
      baseClassData,
      makeRule({
        timer_mode: 'single',
        hides_known: true,
        distraction_count_min: 2,
        area_count: 1,
        max_time_seconds_fixed: 180,
        hide_count_fixed: 2,
      })
    );
    expect(result).toMatchObject({
      timerMode: 'single',
      hidesKnown: true,
      distractionCount: 2,
      areaCount: 1,
      timeLimitSeconds: 180,
      hideCount: 2,
    });
  });
});
