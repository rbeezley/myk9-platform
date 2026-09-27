import { describe, it, expect } from 'vitest';
import type { Trial } from '@/components/trials/types/trial.types';
import type { TrialStats } from '../TrialsTab';
import {
  activeTrialsTabViewId,
  buildTrialsTabViews,
  filterTrialsForTab,
  trialsTabViewFilters,
} from '../trialsTabViews';

function makeTrial(overrides: Partial<Trial> & { id: string }): Trial {
  return {
    showId: 'show-1',
    showName: 'Test Show',
    trialDate: '2026-05-10',
    name: 'Trial',
    trialNumber: '1',
    status: 'Upcoming',
    ...overrides,
  } as Trial;
}

const NO_STATS: Record<string, TrialStats> = {};

describe('trialsTabViews', () => {
  it('hides the views when every trial shares one status', () => {
    const trials = [makeTrial({ id: 't1' }), makeTrial({ id: 't2' })];
    expect(buildTrialsTabViews(trials, NO_STATS)).toEqual([]);
  });

  it('hides the views when every trial is completed', () => {
    const trials = [makeTrial({ id: 't1', status: 'Completed' })];
    const stats: Record<string, TrialStats> = {
      t1: { classCount: 2, entryCount: 4, completedClasses: 2 },
    };
    expect(buildTrialsTabViews(trials, stats)).toEqual([]);
  });

  it('builds All/Pending/Completed with counts matching the actual rows', () => {
    const trials = [
      makeTrial({ id: 'pending', status: 'Upcoming' }),
      makeTrial({ id: 'completed', status: 'Completed' }),
    ];
    const stats: Record<string, TrialStats> = {
      pending: { classCount: 2, entryCount: 4, completedClasses: 0 },
      completed: { classCount: 2, entryCount: 4, completedClasses: 2 },
    };

    const views = buildTrialsTabViews(trials, stats);
    expect(views).toEqual([
      { id: 'all', label: 'All', count: 2 },
      { id: 'pending', label: 'Pending', count: 1 },
      { id: 'completed', label: 'Completed', count: 1 },
    ]);
  });

  it('filterTrialsForTab matches the counts buildTrialsTabViews reports', () => {
    const trials = [
      makeTrial({ id: 'pending', status: 'Upcoming' }),
      makeTrial({ id: 'completed', status: 'Completed' }),
    ];
    const stats: Record<string, TrialStats> = {
      pending: { classCount: 2, entryCount: 4, completedClasses: 0 },
      completed: { classCount: 2, entryCount: 4, completedClasses: 2 },
    };

    expect(filterTrialsForTab(trials, stats, 'pending').map(t => t.id)).toEqual(['pending']);
    expect(filterTrialsForTab(trials, stats, 'completed').map(t => t.id)).toEqual(['completed']);
    expect(filterTrialsForTab(trials, stats, 'all').map(t => t.id)).toEqual([
      'pending',
      'completed',
    ]);
  });

  it('activeTrialsTabViewId and trialsTabViewFilters round-trip every view id', () => {
    for (const id of ['all', 'pending', 'completed'] as const) {
      expect(activeTrialsTabViewId(id)).toBe(id);
      expect(trialsTabViewFilters(id)).toBe(id);
    }
  });

  it('trialsTabViewFilters falls back to all for an unknown id', () => {
    expect(trialsTabViewFilters('bogus')).toBe('all');
  });
});
