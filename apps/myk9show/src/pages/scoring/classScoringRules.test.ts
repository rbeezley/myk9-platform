/** MYK9-1102: every scoring route reads the class rule's 30-second warning. */
import { describe, it, expect } from 'vitest';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';
import { classScoringRules } from './classScoringRules';

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
});
