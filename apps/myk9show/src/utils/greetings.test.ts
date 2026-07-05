import { afterEach, describe, expect, it, vi } from 'vitest';
import { getLoginGreeting } from './greetings';

describe('getLoginGreeting', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ['2026-07-05T08:00:00', 'Good morning, Pat.'],
    ['2026-07-05T13:00:00', 'Good afternoon, Pat.'],
    ['2026-07-05T20:00:00', 'Good evening, Pat.'],
  ])('uses calm time-of-day copy at %s', (now, expected) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));

    expect(getLoginGreeting('Pat')).toBe(expected);
  });

  it('does not use motivational or clever phrases', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-05T20:00:00'));

    expect(getLoginGreeting('Test')).not.toMatch(/vibes|earned this|end strong|fire/i);
  });
});
