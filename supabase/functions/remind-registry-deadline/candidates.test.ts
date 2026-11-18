// @vitest-environment node
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';
import { describe, expect, it } from 'vitest';
import { loadReminderCandidates } from './candidates.ts';
import { IN_CHUNK } from './paging.ts';

type Row = Record<string, unknown>;

/** A tiny PostgREST: tables of rows, `.in`, `.range` and a record of every `.in` list size. */
function fakeSupabase(tables: Record<string, Row[]>) {
  const inSizes: number[] = [];
  const tablesRead: string[] = [];
  const client = {
    from(table: string) {
      tablesRead.push(table);
      let rows = tables[table] ?? [];
      const chain = {
        select: () => chain,
        gte: () => chain,
        lte: () => chain,
        gt: () => chain,
        eq: (column: string, value: unknown) => {
          rows = rows.filter(row => row[column] === value);
          return chain;
        },
        is: (column: string, value: unknown) => {
          rows = rows.filter(row => (row[column] ?? null) === value);
          return chain;
        },
        order: () => chain,
        in: (column: string, values: unknown[]) => {
          inSizes.push(values.length);
          rows = rows.filter(row => values.includes(row[column]));
          return chain;
        },
        range: (from: number, to: number) =>
          Promise.resolve({ data: rows.slice(from, to + 1), error: null }),
      };
      return chain;
    },
  };
  return { client: client as unknown as SupabaseClient, inSizes, tablesRead };
}

const NOW = new Date('2026-11-22T20:00:00Z');

describe('loadReminderCandidates', () => {
  it('finds every show past the 1,000-row cap and sends each .in() in chunks', async () => {
    const shows = Array.from({ length: 1205 }, (_, index) => ({
      id: `show-${index}`,
      name: `Show ${index}`,
      status: 'completed',
    }));
    // Two trials per show: 2,410 rows, well past one page.
    const trials = shows.flatMap(show => [
      {
        id: `${show.id}-a`,
        show_id: show.id,
        date: '2026-11-17',
        timezone: null,
        registry_id: 'AKC',
        trial_type: 'Scent Work',
        status: 'completed',
      },
      {
        id: `${show.id}-b`,
        show_id: show.id,
        date: '2026-11-17',
        timezone: null,
        registry_id: 'AKC',
        trial_type: 'Scent Work',
        status: 'completed',
      },
    ]);
    const { client, inSizes } = fakeSupabase({ trials, shows, result_submissions: [] });

    const candidates = await loadReminderCandidates(client, NOW);

    expect(candidates).toHaveLength(1205);
    expect(candidates.every(candidate => candidate.trials.length === 2)).toBe(true);
    expect(Math.max(...inSizes)).toBeLessThanOrEqual(IN_CHUNK);
  });

  it('skips draft and cancelled shows', async () => {
    const shows = [
      { id: 's1', name: 'Live', status: 'completed' },
      { id: 's2', name: 'Draft', status: 'draft' },
      { id: 's3', name: 'Cancelled', status: 'Canceled' },
    ];
    const trials = shows.map(show => ({
      id: `${show.id}-t`,
      show_id: show.id,
      date: '2026-11-17',
      timezone: null,
      registry_id: null,
      trial_type: null,
      status: null,
    }));
    const { client } = fakeSupabase({ trials, shows, result_submissions: [] });
    const candidates = await loadReminderCandidates(client, NOW);
    expect(candidates.map(candidate => candidate.showId)).toEqual(['s1']);
  });

  it('reads the score history only for a show with an app-sent AKC file, tied to its trial', async () => {
    const shows = [
      { id: 's1', name: 'Sent', status: 'completed' },
      { id: 's2', name: 'Not sent', status: 'completed' },
    ];
    const trials = shows.map(show => ({
      id: `${show.id}-t`,
      show_id: show.id,
      date: '2026-11-17',
      timezone: null,
      registry_id: 'AKC',
      trial_type: 'Scent Work',
      status: 'completed',
    }));
    const { client } = fakeSupabase({
      trials,
      shows,
      result_submissions: [
        {
          id: 'r1',
          show_id: 's1',
          organization: 'AKC',
          status: 'sent',
          submitted_at: '2026-11-18T12:00:00Z',
        },
      ],
      entry_score_audit: [
        {
          id: 'a1',
          show_id: 's1',
          class_id: 'c1',
          changed_at: '2026-11-19T12:00:00Z',
          changes: { result_status: { old: 'q', new: 'nq' } },
        },
        {
          id: 'a2',
          show_id: 's1',
          class_id: 'c2',
          changed_at: '2026-11-19T13:00:00Z',
          changes: { judge_notes: { old: 'a', new: 'b' } },
        },
      ],
      classes: [
        { id: 'c1', trial_id: 's1-t', deleted_at: null },
        { id: 'c2', trial_id: 's1-t', deleted_at: null },
      ],
    });
    const candidates = await loadReminderCandidates(client, NOW);
    const sent = candidates.find(candidate => candidate.showId === 's1');
    const notSent = candidates.find(candidate => candidate.showId === 's2');
    // A notes-only change does not touch the file, so only c1 counts.
    expect(sent?.scoreChanges).toEqual([{ trialId: 's1-t', changedAt: '2026-11-19T12:00:00Z' }]);
    expect(notSent?.scoreChanges).toBeUndefined();
  });

  const sentAkc = (showId: string) => ({
    id: `r-${showId}`,
    show_id: showId,
    organization: 'AKC',
    status: 'sent',
    submitted_at: '2026-11-18T12:00:00Z',
  });
  const akcTrial = (showId: string, date: string) => ({
    id: `${showId}-t`,
    show_id: showId,
    date,
    timezone: null,
    registry_id: 'AKC',
    trial_type: 'Scent Work',
    status: 'completed',
  });

  it('skips the score history for a show whose deadline is outside the reminder window', async () => {
    const shows = [{ id: 's1', name: 'Too early', status: 'completed' }];
    // The last day was 12 days ago: the AKC deadline (7 days after it) has already passed.
    const { client, tablesRead } = fakeSupabase({
      trials: [akcTrial('s1', '2026-11-10')],
      shows,
      result_submissions: [sentAkc('s1')],
      entry_score_audit: [],
      classes: [],
    });
    const candidates = await loadReminderCandidates(client, NOW);
    expect(candidates[0]?.scoreChanges).toBeUndefined();
    expect(tablesRead).not.toContain('entry_score_audit');
  });

  it('ignores score changes in a deleted or missing class', async () => {
    const shows = [{ id: 's1', name: 'Sent', status: 'completed' }];
    const audit = (id: string, classId: string) => ({
      id,
      show_id: 's1',
      class_id: classId,
      changed_at: '2026-11-19T12:00:00Z',
      changes: { result_status: { old: 'q', new: 'nq' } },
    });
    const { client } = fakeSupabase({
      trials: [akcTrial('s1', '2026-11-17')],
      shows,
      result_submissions: [sentAkc('s1')],
      entry_score_audit: [audit('a1', 'gone'), audit('a2', 'missing')],
      classes: [{ id: 'gone', trial_id: 's1-t', deleted_at: '2026-11-20T00:00:00Z' }],
    });
    const candidates = await loadReminderCandidates(client, NOW);
    expect(candidates[0]?.scoreChanges).toEqual([]);
  });
});
