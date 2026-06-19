import { beforeEach, describe, expect, it } from 'vitest';
import { hasSeenResultReveal, markResultRevealSeen } from './resultRevealSeen';

describe('result reveal seen state', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('tracks seen state by release key', () => {
    expect(hasSeenResultReveal('entry-1:release-1')).toBe(false);
    markResultRevealSeen('entry-1:release-1');
    expect(hasSeenResultReveal('entry-1:release-1')).toBe(true);
    expect(hasSeenResultReveal('entry-1:release-2')).toBe(false);
  });
});
