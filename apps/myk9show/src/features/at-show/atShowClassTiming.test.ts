import { describe, expect, it } from 'vitest';

import { formatAtShowClassTime } from './atShowClassTiming';

describe('formatAtShowClassTime', () => {
  it('renders a revised instant in the Trial timezone', () => {
    expect(formatAtShowClassTime('2026-07-20T15:15:00.000Z', 'America/Chicago')).toBe(
      '10:15 AM'
    );
  });

  it('normalizes a scheduled clock time', () => {
    expect(formatAtShowClassTime('09:00', 'America/Chicago')).toBe('9:00 AM');
  });
});
