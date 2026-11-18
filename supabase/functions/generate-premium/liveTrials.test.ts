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

  it('reads a missing list as no trials', () => {
    expect(livePremiumTrials(null)).toEqual([]);
    expect(livePremiumTrials(undefined)).toEqual([]);
  });
});
