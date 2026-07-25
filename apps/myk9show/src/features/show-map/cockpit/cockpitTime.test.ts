import { describe, expect, it } from 'vitest';

import { clockTimeToInstant, instantToClockTime } from './cockpitTime';

describe('cockpit time conversion', () => {
  it('records the selected Trial-local time as an instant', () => {
    expect(clockTimeToInstant('2026-07-20', '10:15', 'America/Chicago')).toBe(
      '2026-07-20T15:15:00.000Z'
    );
  });

  it('renders an instant back in the Trial timezone', () => {
    expect(instantToClockTime('2026-07-20T15:15:00.000Z', 'America/Chicago')).toBe('10:15');
  });
});
