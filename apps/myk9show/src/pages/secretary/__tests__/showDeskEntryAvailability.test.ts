/**
 * Tests for the Show Desk's entries-availability predicate and tally.
 *
 * The confirm re-score flagged that the sweep's highest-risk changes had no
 * tests at all -- the suites that existed exercised pure layers the page never
 * reached, because a full-page bail-out returned before them. That bail-out is
 * gone (it also cost an offline secretary the class schedule, which does not
 * come from this query), so these now cover the code that actually runs.
 */

import { describe, it, expect } from 'vitest';
import { getShowDeskEntriesAvailability, tallyEntriesByClass } from '../showDeskEntryAvailability';
import type { SecretaryEntry } from '@/services/database/entries';

function entry(classId: string | null, isScored: boolean): SecretaryEntry {
  return { class_id: classId, is_scored: isScored } as unknown as SecretaryEntry;
}

describe('getShowDeskEntriesAvailability', () => {
  it('treats delivered data as known, including a genuine empty show', () => {
    expect(getShowDeskEntriesAvailability({ data: [], isLoading: false, isError: false })).toEqual({
      entriesKnown: true,
      entriesUnavailable: false,
    });
  });

  it('treats a PAUSED query as unavailable, not as an empty show', () => {
    // The offline case: fetchStatus 'paused' makes isFetching false, which
    // makes isLoading false, and pending is not error.
    expect(
      getShowDeskEntriesAvailability({ data: undefined, isLoading: false, isError: false })
    ).toEqual({ entriesKnown: false, entriesUnavailable: true });
  });

  it('does not call a still-loading query unavailable', () => {
    const result = getShowDeskEntriesAvailability({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    expect(result.entriesKnown).toBe(false);
    expect(result.entriesUnavailable).toBe(false);
  });

  it('leaves an errored query to the error branch rather than the paused one', () => {
    const result = getShowDeskEntriesAvailability({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    expect(result.entriesKnown).toBe(false);
    expect(result.entriesUnavailable).toBe(false);
  });

  it('does not offer a retry for a DISABLED query, which refetch cannot start', () => {
    const result = getShowDeskEntriesAvailability({
      data: undefined,
      isLoading: false,
      isError: false,
      isEnabled: false,
    });

    expect(result.entriesUnavailable).toBe(false);
  });

  it('still trusts cached data even once the query has errored', () => {
    // Stale-but-real counts beat no counts: the error branch handles the
    // no-data case, and this one keeps the desk usable.
    const result = getShowDeskEntriesAvailability({
      data: [entry('class-1', true)],
      isLoading: false,
      isError: true,
    });

    expect(result.entriesKnown).toBe(true);
  });
});

describe('tallyEntriesByClass', () => {
  it('counts totals and scored per class in one pass', () => {
    const tallies = tallyEntriesByClass([
      entry('class-1', true),
      entry('class-1', false),
      entry('class-1', false),
      entry('class-2', true),
    ]);

    expect(tallies.get('class-1')).toEqual({ total: 3, scored: 1, runList: 3 });
    expect(tallies.get('class-2')).toEqual({ total: 1, scored: 1, runList: 1 });
  });

  it('counts only accepted dogs still expected to run (MYK9-976 rule)', () => {
    // Exterior Excellent on the demo show: Juni pending, Ranger and Maple
    // withdrawn. "0 of 3 scored" would claim three dogs still to score.
    const row = (entry_status: string, is_scored = false, extra: object = {}) =>
      ({ class_id: 'class-1', entry_status, is_scored, ...extra }) as unknown as SecretaryEntry;
    const tallies = tallyEntriesByClass([
      row('submitted'),
      row('withdrawn'),
      row('scratched'),
      row('absent'),
      row('moved'),
      row('not_accepted'),
      row('confirmed', false, { check_in_status: 'pulled' }),
      row('confirmed', true),
      row('confirmed'),
    ]);

    expect(tallies.get('class-1')).toEqual({ total: 2, scored: 1, runList: 4 });
  });

  it('counts an absent or excused result as done, as the server does', () => {
    const row = (result_status: string | null, is_scored = false) =>
      ({
        class_id: 'class-1',
        entry_status: 'confirmed',
        is_scored,
        result_status,
      }) as unknown as SecretaryEntry;
    const tallies = tallyEntriesByClass([
      row('absent'),
      row('excused'),
      row(null, true),
      row(null),
    ]);

    expect(tallies.get('class-1')).toEqual({ total: 4, scored: 3, runList: 4 });
  });

  it('keeps pending dogs in the run-list count, which Run order sorts', () => {
    const row = (entry_status: string) =>
      ({ class_id: 'class-1', entry_status, is_scored: false }) as unknown as SecretaryEntry;
    const tallies = tallyEntriesByClass([row('confirmed'), row('submitted'), row('submitted')]);

    expect(tallies.get('class-1')).toEqual({ total: 1, scored: 0, runList: 3 });
  });

  it('omits a class with no entries rather than inventing a zero row', () => {
    const tallies = tallyEntriesByClass([entry('class-1', false)]);

    // The caller decides what an absent class means -- 0 when the read
    // succeeded, unknown when it did not. Fabricating rows here would take
    // that choice away.
    expect(tallies.has('class-2')).toBe(false);
  });

  it('skips entries with no class rather than bucketing them under a falsy key', () => {
    const tallies = tallyEntriesByClass([entry(null, true), entry('class-1', true)]);

    expect(tallies.size).toBe(1);
    expect(tallies.get('class-1')).toEqual({ total: 1, scored: 1, runList: 1 });
  });

  it('counts only a strict true as scored', () => {
    const tallies = tallyEntriesByClass([
      { class_id: 'class-1', is_scored: null } as unknown as SecretaryEntry,
      entry('class-1', true),
    ]);

    expect(tallies.get('class-1')).toEqual({ total: 2, scored: 1, runList: 2 });
  });
});
