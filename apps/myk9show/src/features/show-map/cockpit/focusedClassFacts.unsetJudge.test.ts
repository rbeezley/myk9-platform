import { describe, expect, it } from 'vitest';

import { buildFocusedClassFacts } from './focusedClassFacts';

function factsFor(judgeName: string | null) {
  return buildFocusedClassFacts({
    focused: {
      progress: { evidence: 'computed', value: { completed: 0, total: 3 } },
      lifecycle: { evidence: 'recorded', value: 'not-started' },
      judgeName,
    },
    entryCount: 3,
    breakdown: undefined,
    showJudge: true,
  } as Parameters<typeof buildFocusedClassFacts>[0]);
}

describe('focused class facts unset judge (MYK9-1853)', () => {
  it('prints the real name with the Judge prefix, never a doubled Judge', () => {
    const facts = factsFor('Pat Lee');
    expect(facts).toContain('Judge Pat Lee');
    expect(facts.join(' ')).not.toMatch(/Judge Judge|Judge TBD/);
  });

  it('leaves the judge out for null, blank and the legacy TBD alike', () => {
    for (const unset of [null, '', '  ', 'TBD']) {
      expect(factsFor(unset).some(fact => fact.includes('Judge'))).toBe(false);
    }
  });
});
