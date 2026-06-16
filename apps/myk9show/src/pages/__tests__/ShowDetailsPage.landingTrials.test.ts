import { describe, it, expect } from 'vitest';
import type { Trial } from '@/components/trials/types/trial.types';
import { pickLandingTrials } from '../ShowDetailsPage.landingTrials';

const storeTrial = (id: string): Trial =>
  ({ id, showId: 'show-1', name: `Store ${id}` }) as Trial;

const publicRow = (id: string) => ({
  id,
  show_id: 'show-1',
  name: `Public ${id}`,
  date: '2026-07-03',
  show: { id: 'show-1', name: 'Monogram' },
});

describe('pickLandingTrials', () => {
  it('uses the replicated store trials when present (authenticated/warm session)', () => {
    const store = [storeTrial('t1'), storeTrial('t2')];
    expect(pickLandingTrials(store, [publicRow('px')])).toBe(store);
  });

  it('falls back to mapped public PostgREST rows when the store is empty (cold anon)', () => {
    const result = pickLandingTrials([], [publicRow('pa'), publicRow('pb')]);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('pa');
    // first trial id is what publicClassesHref needs to build the public "See classes" link
    expect(result[0].showId).toBe('show-1');
  });

  it('returns an empty array when both sources are empty (no link rendered)', () => {
    expect(pickLandingTrials([], [])).toEqual([]);
    expect(pickLandingTrials([], null)).toEqual([]);
    expect(pickLandingTrials([], undefined)).toEqual([]);
  });
});
