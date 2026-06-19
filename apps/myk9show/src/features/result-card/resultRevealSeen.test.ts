import { beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('treats unavailable storage as unseen without throwing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });

    expect(hasSeenResultReveal('entry-1:release-1')).toBe(false);
    expect(() => markResultRevealSeen('entry-1:release-1')).not.toThrow();
  });
});
