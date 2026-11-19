import { describe, expect, it } from 'vitest';

import { livePremiumTrials } from './liveTrials.ts';

describe('livePremiumTrials (MYK9-2044)', () => {
  it('keeps live trials and drops cancelled and soft-deleted ones, in order', () => {
    const trials = [
      { id: 'eve', status: 'upcoming', deleted_at: null },
      { id: 'cancelled', status: 'cancelled', deleted_at: null },
      { id: 'deleted', status: 'upcoming', deleted_at: '2026-11-01T00:00:00Z' },
      { id: 'no-status' },
    ];
    expect(livePremiumTrials(trials).map(t => t.id)).toEqual(['eve', 'no-status']);
  });

  it('returns live trials in schedule order whatever order the rows arrive in (MYK9-2186)', () => {
    const trials = [
      { id: 'sun', date: '2027-01-03', planned_start_time: '08:00', trial_type: 'rally' },
      { id: 'sat-pm', date: '2027-01-02', planned_start_time: '13:00', trial_type: 'obedience' },
      { id: 'sat-b', date: '2027-01-02', planned_start_time: '08:00', trial_type: 'scent' },
      { id: 'sat-a', date: '2027-01-02', planned_start_time: '08:00', trial_type: 'scent' },
    ];
    expect(livePremiumTrials(trials).map(t => t.id)).toEqual(['sat-a', 'sat-b', 'sat-pm', 'sun']);
  });

  it('reads a missing list as no trials', () => {
    expect(livePremiumTrials(null)).toEqual([]);
    expect(livePremiumTrials(undefined)).toEqual([]);
  });
});
