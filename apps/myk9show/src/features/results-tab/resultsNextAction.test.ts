import { describe, expect, it } from 'vitest';
import {
  deriveResultsNextAction,
  deriveResultsPhase,
  matchesResultsStatusFilter,
  offeredResultsStatusFilters,
  type ResultsClassState,
} from './resultsNextAction';

const base: ResultsClassState = {
  classStatus: 'Completed',
  expectedCount: 8,
  scoredCount: 0,
  releasedAt: null,
  paperworkPrinted: false,
};

const state = (overrides: Partial<ResultsClassState>): ResultsClassState => ({
  ...base,
  ...overrides,
});

describe('deriveResultsNextAction', () => {
  it('a complete class whose release state is unknown offers no Release and is not "needs me"', () => {
    const unknown = state({ scoredCount: 8, releasedAt: undefined });
    expect(deriveResultsPhase(unknown)).toBe('release-unknown');
    expect(deriveResultsNextAction(unknown).kind).toBe('none');
    expect(matchesResultsStatusFilter('release-unknown', 'needs-me')).toBe(false);
    expect(matchesResultsStatusFilter('release-unknown', 'ready-to-release')).toBe(false);
    expect(deriveResultsPhase(state({ scoredCount: 8, releasedAt: null }))).toBe(
      'ready-to-release'
    );
  });

  it('not started: links to Overview', () => {
    expect(deriveResultsPhase(base)).toBe('not-started');
    expect(deriveResultsNextAction(base)).toEqual({ kind: 'overview', label: 'Overview' });
  });

  it('in the ring: links to Overview, by status or by a partial score count', () => {
    expect(deriveResultsPhase(state({ classStatus: 'In Progress' }))).toBe('in-ring');
    expect(deriveResultsPhase(state({ scoredCount: 3 }))).toBe('in-ring');
    expect(deriveResultsNextAction(state({ scoredCount: 3 })).kind).toBe('overview');
  });

  it('complete and unreleased: Release', () => {
    const complete = state({ classStatus: 'Completed', scoredCount: 8 });
    expect(deriveResultsPhase(complete)).toBe('ready-to-release');
    expect(deriveResultsNextAction(complete)).toEqual({ kind: 'release', label: 'Release' });
  });

  it('a class marked Completed with a dog still unscored is not complete', () => {
    const early = state({ classStatus: 'Completed', scoredCount: 7 });
    expect(deriveResultsPhase(early)).toBe('in-ring');
    expect(deriveResultsNextAction(early).kind).toBe('overview');
  });

  it('every dog scored but the class not marked Completed: Mark complete, not Release or Initials', () => {
    // A manually started class never completes itself, and the sign-off can only be recorded on a
    // Completed class. (This replaces part 1's "scored means complete whatever the stored status";
    // git log -S on its name finds it.)
    for (const classStatus of ['In Progress', 'Scheduled', undefined]) {
      const waiting = state({ classStatus, scoredCount: 8 });
      expect(deriveResultsPhase(waiting)).toBe('ready-to-complete');
      expect(deriveResultsNextAction(waiting)).toEqual({
        kind: 'overview',
        label: 'Mark complete',
      });
    }
    expect(matchesResultsStatusFilter('ready-to-complete', 'needs-me')).toBe(true);
    expect(deriveResultsPhase(state({ classStatus: 'Completed', scoredCount: 8 }))).toBe(
      'ready-to-release'
    );
    expect(deriveResultsPhase(state({ classStatus: 'In Progress', scoredCount: 7 }))).toBe(
      'in-ring'
    );
  });

  it('released but not printed: Print; unreadable print history is not printed', () => {
    const released = state({ scoredCount: 8, releasedAt: '2026-10-10T18:00:00Z' });
    expect(deriveResultsPhase(released)).toBe('released');
    expect(deriveResultsNextAction(released)).toEqual({ kind: 'print', label: 'Print' });
    expect(deriveResultsPhase({ ...released, paperworkPrinted: null })).toBe('released');
  });

  it('released and printed, judge not yet initialed and their day over: Initials', () => {
    const waiting = state({
      scoredCount: 8,
      releasedAt: '2026-10-10T18:00:00Z',
      paperworkPrinted: true,
      judgeSignedOffAt: null,
    });
    expect(deriveResultsPhase(waiting)).toBe('needs-initials');
    expect(deriveResultsNextAction(waiting)).toEqual({ kind: 'initials', label: 'Initials' });
    expect(matchesResultsStatusFilter('needs-initials', 'needs-me')).toBe(true);
    expect(matchesResultsStatusFilter('needs-initials', 'released')).toBe(true);
    expect(matchesResultsStatusFilter('needs-initials', 'done')).toBe(false);
  });

  it('does not ask for initials while the judge still has a class to run that day', () => {
    const open = state({
      scoredCount: 8,
      releasedAt: '2026-10-10T18:00:00Z',
      paperworkPrinted: true,
      judgeSignedOffAt: null,
      judgeDayOpen: true,
    });
    expect(deriveResultsPhase(open)).toBe('done');
    expect(deriveResultsNextAction(open).kind).toBe('none');
  });

  it('initialed (or sign-off not tracked) and printed: Done', () => {
    const printed = state({
      scoredCount: 8,
      releasedAt: '2026-10-10T18:00:00Z',
      paperworkPrinted: true,
    });
    expect(deriveResultsPhase({ ...printed, judgeSignedOffAt: '2026-10-10T21:00:00Z' })).toBe(
      'done'
    );
    expect(deriveResultsPhase(printed)).toBe('done');
  });

  it('initials come after the print, not before it', () => {
    const unprinted = state({
      scoredCount: 8,
      releasedAt: '2026-10-10T18:00:00Z',
      paperworkPrinted: false,
      judgeSignedOffAt: null,
    });
    expect(deriveResultsPhase(unprinted)).toBe('released');
  });

  it('released and printed: Done', () => {
    const done = state({
      scoredCount: 8,
      releasedAt: '2026-10-10T18:00:00Z',
      paperworkPrinted: true,
    });
    expect(deriveResultsPhase(done)).toBe('done');
    expect(deriveResultsNextAction(done)).toEqual({ kind: 'none', label: 'Done' });
  });

  it('cancelled: nothing to do, even when it carries a stale release stamp', () => {
    const cancelled = state({ classStatus: 'Cancelled', releasedAt: '2026-10-10T18:00:00Z' });
    expect(deriveResultsPhase(cancelled)).toBe('cancelled');
    expect(deriveResultsNextAction(cancelled).kind).toBe('none');
  });

  it('pulled-only class (no dog expected to run): nothing to release', () => {
    const pulledOnly = state({ classStatus: 'Completed', expectedCount: 0, scoredCount: 0 });
    expect(deriveResultsPhase(pulledOnly)).toBe('no-dogs');
    expect(deriveResultsNextAction(pulledOnly).kind).toBe('none');
  });

  it('reads legacy status spellings', () => {
    expect(deriveResultsPhase(state({ classStatus: 'in_progress' }))).toBe('in-ring');
    expect(deriveResultsPhase(state({ classStatus: undefined }))).toBe('not-started');
  });

  it('part 2 seam: a tracked, missing verification holds the class at Needs checking', () => {
    const complete = state({ scoredCount: 8 });
    expect(deriveResultsPhase({ ...complete, verifiedAt: null })).toBe('needs-checking');
    expect(deriveResultsNextAction({ ...complete, verifiedAt: null }).kind).toBe('verify');
    expect(deriveResultsPhase({ ...complete, verifiedAt: '2026-10-10T17:00:00Z' })).toBe(
      'ready-to-release'
    );
  });
});

describe('matchesResultsStatusFilter', () => {
  it('Needs me holds the classes waiting on the secretary and nothing else', () => {
    expect(matchesResultsStatusFilter('ready-to-release', 'needs-me')).toBe(true);
    expect(matchesResultsStatusFilter('released', 'needs-me')).toBe(true);
    expect(matchesResultsStatusFilter('needs-checking', 'needs-me')).toBe(true);
    for (const phase of ['not-started', 'in-ring', 'done', 'cancelled', 'no-dogs'] as const) {
      expect(matchesResultsStatusFilter(phase, 'needs-me')).toBe(false);
    }
  });

  it('All classes matches every phase; Released includes Done', () => {
    expect(matchesResultsStatusFilter('in-ring', 'all')).toBe(true);
    expect(matchesResultsStatusFilter('cancelled', 'all')).toBe(true);
    expect(matchesResultsStatusFilter('done', 'released')).toBe(true);
    expect(matchesResultsStatusFilter('ready-to-release', 'released')).toBe(false);
    expect(matchesResultsStatusFilter('released', 'done')).toBe(false);
  });

  it('does not offer a filter that cannot match until verification is stored', () => {
    expect(offeredResultsStatusFilters().map(option => option.id)).toEqual([
      'needs-me',
      'all',
      'ready-to-release',
      'released',
      'done',
    ]);
  });
});
