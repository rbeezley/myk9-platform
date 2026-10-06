/**
 * MYK9-1030 review P2: the judge-day catalog must name a class's judge with the SAME resolver
 * replication uses (`resolveClassJudgeFields`: confirmed only, lowest id), on both read paths.
 * A cold replica falls back to PostgREST, whose embed must therefore carry the assignment's
 * `id` and `status`; a warm replica row carries the already-resolved confirmed judge.
 */
import { describe, expect, it, vi } from 'vitest';

const selectSpy = vi.hoisted(() => vi.fn());

vi.mock('@/services/database/supabaseClient', async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    '@/services/database/supabaseClient'
  );
  const chain = {
    eq: () => chain,
    is: () => chain,
    order: async () => ({ data: [], error: null }),
  };
  return {
    ...actual,
    supabase: {
      from: () => ({
        select: (columns: string) => {
          selectSpy(columns);
          return chain;
        },
      }),
    },
  };
});

import { filterReportDataToJudgeDay, reportClassJudgeId } from './judgeDayScope';
import { mapReplicatedClassToDbRow } from '@/services/mappers/classMappers';
import { getClassesByTrialId } from '@/services/database/classes';

const trials = [{ id: 't1', date: '2026-10-10' }];
// Cold path: the declined assignment comes back FIRST (PostgREST embeds are unordered).
const coldClass = {
  id: 'c1',
  trial_id: 't1',
  judge_assignments: [
    {
      id: 'ja-2',
      person_id: 'raj',
      status: 'declined',
      people: { first_name: 'Raj', last_name: 'P' },
    },
    {
      id: 'ja-1',
      person_id: 'jane',
      status: 'confirmed',
      people: { first_name: 'Jane', last_name: 'S' },
    },
  ],
};
const entries = [{ id: 'e1', class_id: 'c1' }];

describe('judge-day catalog on the cold (PostgREST) path', () => {
  it("puts a class in its confirmed judge's catalog, never the declined judge's", () => {
    const scope = (judgeId: string) =>
      ({ kind: 'judge-day', showId: 's', judgeId, date: '2026-10-10' }) as const;
    expect(
      filterReportDataToJudgeDay({ trials, classes: [coldClass], entries }, scope('jane')).entries
    ).toEqual(entries);
    expect(
      filterReportDataToJudgeDay({ trials, classes: [coldClass], entries }, scope('raj')).classes
    ).toEqual([]);
  });

  it('the PostgREST fallback asks for the assignment id and status the resolver needs', async () => {
    await getClassesByTrialId('t1');
    const embed = String(selectSpy.mock.calls.at(-1)?.[0]).replace(/\s+/g, ' ');
    expect(embed).toMatch(
      /judge_assignments!judge_assignments_class_id_fkey \( id, person_id, status,/
    );
  });

  it('reads the confirmed judge off a warm replica row too', () => {
    const row = mapReplicatedClassToDbRow({
      id: 'c1',
      trialId: 't1',
      name: 'Container Novice',
      judgeId: 'jane',
      judgeName: 'Jane S',
    });
    expect(reportClassJudgeId(row as { id: string; judge_assignments?: unknown })).toBe('jane');
  });
});
