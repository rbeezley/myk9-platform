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

describe('focused class facts unset judge (MYK9-1846)', () => {
  it('prints Judge to be announced for a stored TBD, never a doubled Judge', () => {
    const facts = factsFor('TBD');
    expect(facts).toContain('Judge to be announced');
    expect(facts.join(' ')).not.toMatch(/Judge Judge|Judge TBD/);
  });

  it('prints the real name with the Judge prefix, and nothing for none', () => {
    expect(factsFor('Pat Lee')).toContain('Judge Pat Lee');
    expect(factsFor(null).some(fact => fact.startsWith('Judge'))).toBe(false);
  });
});
