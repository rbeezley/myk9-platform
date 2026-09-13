/**
 * `resolveTrialTimezone` must distinguish "no trial yet" from a real zone
 * (Codex, PR #2201). The old version answered `America/New_York` for both,
 * and a decision taken against that guess crosses midnight early.
 */
import { describe, it, expect } from 'vitest';
import { resolveTrialTimezone } from './entryRowTrial';

describe('resolveTrialTimezone', () => {
  it('is undefined when neither the entry nor the class carries a trial', () => {
    expect(resolveTrialTimezone(null, null)).toBeUndefined();
    expect(resolveTrialTimezone(undefined, undefined)).toBeUndefined();
  });

  it('is undefined when a trial has replicated without its timezone', () => {
    expect(resolveTrialTimezone({ id: 't1', timezone: null }, null)).toBeUndefined();
  });

  it('reads the entry row trial first', () => {
    expect(
      resolveTrialTimezone({ id: 't1', timezone: 'America/Chicago' }, { timezone: 'Asia/Tokyo' })
    ).toBe('America/Chicago');
  });

  it('falls back to the class relation for legacy rows with a null trial_id', () => {
    expect(resolveTrialTimezone(null, { id: 't2', timezone: 'America/Los_Angeles' })).toBe(
      'America/Los_Angeles'
    );
  });

  it('still validates a present but nonsense zone', () => {
    expect(resolveTrialTimezone({ id: 't3', timezone: 'Mars/Olympus' }, null)).toBe(
      'America/New_York'
    );
  });
});
