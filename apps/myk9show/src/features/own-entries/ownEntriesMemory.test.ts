import { beforeEach, describe, expect, it } from 'vitest';
import { clearJustEntered, hasJustEntered, markJustEntered } from './ownEntriesMemory';

beforeEach(() => {
  window.localStorage.clear();
});

describe('just-entered marker', () => {
  it('is honoured only for the account that checked out', () => {
    markJustEntered('person-1');
    expect(hasJustEntered('person-1')).toBe(true);
    expect(hasJustEntered('person-2')).toBe(false);
    expect(hasJustEntered(null)).toBe(false);
  });

  it('clears', () => {
    markJustEntered('person-1');
    clearJustEntered();
    expect(hasJustEntered('person-1')).toBe(false);
  });
});
