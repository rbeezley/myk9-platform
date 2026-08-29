import { describe, it, expect } from 'vitest';
import { getSharedClassFacts } from './classGroupFacts';
import type { EntryClass } from './my-entries-types';

function cls(overrides: Partial<EntryClass> = {}): EntryClass {
  return {
    id: 'c1',
    name: 'Novice Container',
    number: '12',
    fee: 25,
    status: 'entered',
    ...overrides,
  };
}

describe('getSharedClassFacts', () => {
  it('hoists a trial date every row agrees on', () => {
    const facts = getSharedClassFacts([
      cls({ id: 'a', trialDate: new Date('2026-08-01T00:00:00Z') }),
      cls({ id: 'b', trialDate: new Date('2026-08-01T00:00:00Z') }),
      cls({ id: 'c', trialDate: new Date('2026-08-01T00:00:00Z') }),
    ]);
    expect(facts.trialDate?.getTime()).toBe(new Date('2026-08-01T00:00:00Z').getTime());
  });

  it('does NOT hoist a trial date when one row differs', () => {
    const facts = getSharedClassFacts([
      cls({ id: 'a', trialDate: new Date('2026-08-01T00:00:00Z') }),
      cls({ id: 'b', trialDate: new Date('2026-08-02T00:00:00Z') }),
    ]);
    expect(facts.trialDate).toBeUndefined();
  });

  it('does NOT hoist a fact when one row is missing it', () => {
    const facts = getSharedClassFacts([
      cls({ id: 'a', handler: 'Rich Beezley' }),
      cls({ id: 'b' }),
    ]);
    expect(facts.handler).toBeUndefined();
  });

  it('hoists trial number and handler independently of each other', () => {
    const facts = getSharedClassFacts([
      cls({ id: 'a', trialNumber: '1', handler: 'Rich Beezley' }),
      cls({ id: 'b', trialNumber: '1', handler: 'Dana Cole' }),
    ]);
    expect(facts.trialNumber).toBe('1');
    expect(facts.handler).toBeUndefined();
  });

  it('hoists from a single-class order', () => {
    const facts = getSharedClassFacts([cls({ trialNumber: '2', handler: 'Rich Beezley' })]);
    expect(facts.trialNumber).toBe('2');
    expect(facts.handler).toBe('Rich Beezley');
  });

  it('returns nothing for an empty class list', () => {
    expect(getSharedClassFacts([])).toEqual({});
  });

  it('hoists nothing when any row is an unresolved replication placeholder', () => {
    // The placeholder does not know its own trial, so hoisting a sibling's
    // value would state that value as this row's fact too.
    const facts = getSharedClassFacts([
      cls({ id: 'a', trialNumber: '1', handler: 'Rich Beezley' }),
      cls({ id: 'b', trialNumber: '1', handler: 'Rich Beezley', unresolved: true }),
    ]);
    expect(facts).toEqual({});
  });
});
