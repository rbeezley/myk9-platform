/**
 * Regression tests for the impeccable p5 blockers.
 *
 * These two pages decide whether a secretary files results with a sanctioning
 * organisation. Every finding below is the same defect the sweep keeps meeting
 * -- an unread value rendered as a settled fact -- but here the fact is
 * "results are submitted" or "these are safe to send", so the consequence
 * leaves the software: a duplicate filing with AKC, or a show closed out
 * believing results went in when they did not.
 */

import { describe, it, expect } from 'vitest';
import { chooseDefaultSubmissionOptionKey } from '../ResultsSubmissionPage/submissionOptions';
import { buildResultsReadinessSummary } from '../ResultsControlPage/readinessSummary';
import type { RegistrySubmissionOption } from '../ResultsSubmissionPage/submissionOptions';

const OPTIONS = [
  { key: 'AKC:scent_work', organization: 'AKC', label: 'AKC Scent Work' },
  { key: 'UKC:nosework', organization: 'UKC', label: 'UKC Nosework' },
  { key: 'ASCA:scent_detection', organization: 'ASCA', label: 'ASCA Scent Detection' },
] as unknown as RegistrySubmissionOption[];

describe('chooseDefaultSubmissionOptionKey — an unknown registry is not AKC (audit A5)', () => {
  it('selects nothing when the show record has not loaded', () => {
    // The show query has no networkMode, so offline it pauses and `show` is
    // null. `?? ''` used to fall through to 'AKC', making an unloaded show
    // indistinguishable from a genuine AKC one -- on a UKC trial that
    // preselected AKC Scent Work and printed AKC closeout steps.
    expect(chooseDefaultSubmissionOptionKey(undefined, OPTIONS)).toBe('');
    expect(chooseDefaultSubmissionOptionKey(null, OPTIONS)).toBe('');
    expect(chooseDefaultSubmissionOptionKey('', OPTIONS)).toBe('');
    expect(chooseDefaultSubmissionOptionKey('   ', OPTIONS)).toBe('');
  });

  it('selects nothing for an organization it does not recognise', () => {
    // Guessing AKC for an unrecognised registry is the same error as guessing
    // it for an absent one.
    expect(chooseDefaultSubmissionOptionKey('CPE', OPTIONS)).toBe('');
  });

  it('still resolves each registry it does recognise', () => {
    expect(chooseDefaultSubmissionOptionKey('AKC', OPTIONS)).toBe('AKC:scent_work');
    expect(chooseDefaultSubmissionOptionKey('UKC', OPTIONS)).toBe('UKC:nosework');
    expect(chooseDefaultSubmissionOptionKey('ASCA', OPTIONS)).toBe('ASCA:scent_detection');
  });

  it('matches case-insensitively and inside a longer name', () => {
    expect(chooseDefaultSubmissionOptionKey('ukc nosework', OPTIONS)).toBe('UKC:nosework');
  });
});

const scoredEntry = (classId: string) =>
  ({ classId, resultStatus: 'qualified', isScored: true }) as never;
const unscoredEntry = (classId: string) =>
  ({ classId, resultStatus: 'pending', isScored: false }) as never;
const releasedClass = (id: string) =>
  ({ id, results_released_at: '2026-08-28T12:00:00Z' }) as never;

describe('buildResultsReadinessSummary — zero entries is not zero unscored (audit A3)', () => {
  it('refuses to vouch when there are classes but no entries for them', () => {
    // `classes` and `entries` come from two INDEPENDENT replication
    // subscriptions, and getAll() returns [] for every failure including its
    // own timeout (MYK9-252). So this state is reached mid-hydration or on a
    // swallowed error -- and unscoredEntries is 0 because there are no entries,
    // not because everything is scored.
    const summary = buildResultsReadinessSummary([releasedClass('c1')], []);

    expect(summary.entriesUncorroborated).toBe(true);
    expect(summary.safeToSend).toBe(false);
  });

  it('does not report ready for a released class whose entries never arrived', () => {
    // The exact false positive: released classes + no entries used to satisfy
    // every clause of safeToSend.
    const summary = buildResultsReadinessSummary([releasedClass('c1'), releasedClass('c2')], []);

    expect(summary.safeToSend).toBe(false);
  });

  it('reports ready when entries corroborate the classes and all are scored', () => {
    const summary = buildResultsReadinessSummary(
      [releasedClass('c1')],
      [scoredEntry('c1'), scoredEntry('c1')]
    );

    expect(summary.entriesUncorroborated).toBe(false);
    expect(summary.safeToSend).toBe(true);
  });

  it('still blocks on genuinely unscored entries', () => {
    const summary = buildResultsReadinessSummary(
      [releasedClass('c1')],
      [scoredEntry('c1'), unscoredEntry('c1')]
    );

    expect(summary.entriesUncorroborated).toBe(false);
    expect(summary.unscoredEntries).toBe(1);
    expect(summary.safeToSend).toBe(false);
  });

  it('is not uncorroborated when there are no classes either', () => {
    // Nothing to corroborate. safeToSend is false on its own clause, and the
    // page should not claim a read failure it has no evidence for.
    const summary = buildResultsReadinessSummary([], []);

    expect(summary.entriesUncorroborated).toBe(false);
    expect(summary.safeToSend).toBe(false);
  });

  it('ignores entries belonging to other classes when corroborating', () => {
    const summary = buildResultsReadinessSummary([releasedClass('c1')], [scoredEntry('other')]);

    expect(summary.entriesUncorroborated).toBe(true);
    expect(summary.safeToSend).toBe(false);
  });
});
