import { describe, expect, it } from 'vitest';
import { decideScopeStamp, type ScopeStampInputs } from './scopeStampDecision';

/**
 * MYK9-1133: the one place that decides what a completed sync writes to a
 * scope's account stamp. `stamp` writes the current account, `clear` removes the
 * stamp (the scope reads cold), `keep` writes nothing.
 */

const base: ScopeStampInputs = {
  stamping: true,
  identityHeld: true,
  holdsOthersRows: false,
  cleanupCompleted: false,
  fetchComplete: true,
  foreignWorkRemaining: false,
};

const bools = [false, true] as const;

function expected(i: ScopeStampInputs) {
  if (!i.stamping) return 'keep';
  if (!i.identityHeld) return 'clear';
  if (i.foreignWorkRemaining) return 'clear';
  if (i.holdsOthersRows && !(i.cleanupCompleted && i.fetchComplete)) return 'clear';
  return 'stamp';
}

describe('decideScopeStamp', () => {
  it('matches the decision table for every combination', () => {
    let rows = 0;
    for (const stamping of bools)
      for (const identityHeld of bools)
        for (const holdsOthersRows of bools)
          for (const cleanupCompleted of bools)
            for (const fetchComplete of bools)
              for (const foreignWorkRemaining of bools) {
                const inputs = {
                  stamping,
                  identityHeld,
                  holdsOthersRows,
                  cleanupCompleted,
                  fetchComplete,
                  foreignWorkRemaining,
                };
                expect(decideScopeStamp(inputs), JSON.stringify(inputs)).toBe(expected(inputs));
                rows++;
              }
    expect(rows).toBe(64);
  });

  it.each([
    ['a sync that does not stamp leaves the stamp alone', { stamping: false }, 'keep'],
    ['an identity that changed or is unresolved clears it', { identityHeld: false }, 'clear'],
    ['an account claiming a scope nothing else touched stamps it', {}, 'stamp'],
    ["another account's rows still here, no cleanup: cold", { holdsOthersRows: true }, 'clear'],
    [
      "another account's rows gone by the adapter's own complete cleanup: stamped",
      { holdsOthersRows: true, cleanupCompleted: true },
      'stamp',
    ],
    [
      'cleanup ran but the fetch was partial: cold',
      { holdsOthersRows: true, cleanupCompleted: true, fetchComplete: false },
      'clear',
    ],
    [
      "another account's unsent work still in the scope: cold",
      { holdsOthersRows: true, cleanupCompleted: true, foreignWorkRemaining: true },
      'clear',
    ],
  ] as const)('%s', (_name, override, want) => {
    expect(decideScopeStamp({ ...base, ...override })).toBe(want);
  });
});
