import { describe, expect, it } from 'vitest';

import { formatSecondsAsMSSCC } from '@/lib/format/searchTime';
import type { SecretaryEntry } from '@/services/database/entries';
import type { SyncableTrial, SyncableTrialClass } from '@/store/trial-store-types';
import { buildResultsClassRows } from './buildResultsClassRows';
import {
  buildNationalsLeaderboard,
  compareLeaderboard,
  competitionDay,
  isRankableEntry,
  leaderboardStatus,
} from './nationalsLeaderboard';

let nextId = 0;
function entry(over: Record<string, unknown>): SecretaryEntry {
  const armband = 'armband' in over ? over.armband : '101';
  return {
    id: `e-${nextId++}`,
    class_id: 'c1',
    armband,
    entry_status: 'confirmed',
    is_scored: true,
    result_status: 'qualified',
    points_earned: 0,
    search_time_seconds: 0,
    dog_id: `dog-${armband ?? 'none'}`,
    dog: { id: `dog-${armband ?? 'none'}`, name: 'Ranger', call_name: 'Rex' },
    handler_identity: { source: 'entered', name: 'Jane Doe' },
    ...over,
  } as unknown as SecretaryEntry;
}

const RELEASED = '2026-10-10T16:00:00Z';
const classRows = [
  { id: 'c1', trialDate: '2026-10-10', releasedAt: RELEASED },
  { id: 'c2', trialDate: '2026-10-11', releasedAt: RELEASED },
  { id: 'c3', trialDate: '2026-10-12', releasedAt: RELEASED },
  { id: 'c-hidden', trialDate: '2026-10-10', releasedAt: null },
];
const build = (entries: SecretaryEntry[]) =>
  buildNationalsLeaderboard({ entries, classRows, showStartDate: '2026-10-10' });

describe('competitionDay', () => {
  it('is trial date minus show start plus 1, clamped to 1 to 3', () => {
    expect(competitionDay('2026-10-10', '2026-10-10')).toBe(1);
    expect(competitionDay('2026-10-11', '2026-10-10')).toBe(2);
    expect(competitionDay('2026-10-12', '2026-10-10')).toBe(3);
    expect(competitionDay('2026-10-15', '2026-10-10')).toBe(3);
    expect(competitionDay('2026-10-08', '2026-10-10')).toBe(1);
  });

  it('reads a timestamp as its calendar date and falls back to day 1 on a missing date', () => {
    expect(competitionDay('2026-10-11T23:30:00Z', '2026-10-10')).toBe(2);
    expect(competitionDay('', '2026-10-10')).toBe(1);
    expect(competitionDay('2026-10-11', null)).toBe(1);
  });
});

describe('leaderboardStatus', () => {
  it('prefers Withdrawn, then Eliminated, then Finals, else nothing', () => {
    expect(leaderboardStatus({ withdrawn: true, eliminated: true, finals: true })).toBe(
      'Withdrawn'
    );
    expect(leaderboardStatus({ withdrawn: false, eliminated: true, finals: true })).toBe(
      'Eliminated'
    );
    expect(leaderboardStatus({ withdrawn: false, eliminated: false, finals: true })).toBe('Finals');
    expect(leaderboardStatus({ withdrawn: false, eliminated: false, finals: false })).toBeNull();
  });
});

describe('sort', () => {
  it('orders points descending, then time ascending', () => {
    const rows = [
      { armband: '1', totalPoints: 10, totalTimeSeconds: 50 },
      { armband: '2', totalPoints: 20, totalTimeSeconds: 90 },
      { armband: '3', totalPoints: 20, totalTimeSeconds: 80 },
    ].sort(compareLeaderboard);
    expect(rows.map(row => row.armband)).toEqual(['3', '2', '1']);
  });

  it('ranks the built board in that order', () => {
    const board = build([
      entry({ armband: '1', points_earned: 10, search_time_seconds: 50 }),
      entry({ armband: '2', points_earned: 20, search_time_seconds: 90 }),
      entry({ armband: '3', points_earned: 20, search_time_seconds: 80 }),
    ]);
    expect(board.map(row => [row.rank, row.armband])).toEqual([
      [1, '3'],
      [2, '2'],
      [3, '1'],
    ]);
  });
});

describe('Status from the shared entry-accounting rules', () => {
  const scoredQ = { entry_status: 'confirmed', result_status: 'qualified', is_scored: true };
  const toRun = { entry_status: 'confirmed', result_status: 'pending', is_scored: false };
  const out = { entry_status: 'withdrawn', result_status: 'pending', is_scored: false };
  const gone = (entry_status: string) => ({ ...toRun, entry_status });
  const pulled = { ...toRun, check_in_status: 'pulled' };
  const statusOf = (...dogEntries: Record<string, unknown>[]) =>
    build([
      entry({ armband: '1', class_id: 'c1', points_earned: 10 }),
      ...dogEntries.map(over => entry({ armband: '1', class_id: 'c2', ...over })),
    ])[0]!.status;

  it.each([
    ['withdrawn plus another class still to run', [out, toRun], null],
    ['withdrawn plus the rest scratched', [out, gone('scratched')], 'Withdrawn'],
    ['withdrawn plus the rest absent', [out, gone('absent')], 'Withdrawn'],
    ['withdrawn plus the rest moved', [out, gone('moved')], 'Withdrawn'],
    ['withdrawn plus the rest not accepted', [out, gone('not_accepted')], 'Withdrawn'],
    ['withdrawn plus a pulled entry', [out, pulled], 'Withdrawn'],
    [
      'withdrawn plus an unscored excused result',
      [out, { ...toRun, result_status: 'excused' }],
      'Withdrawn',
    ],
    ['completed one class then withdrew', [out], 'Withdrawn'],
    ['no withdrawal at all', [scoredQ], null],
    ['no withdrawal, a class still to run', [toRun], null],
  ] as const)('%s', (_name, rest, expected) => {
    expect(statusOf(...rest)).toBe(expected);
  });

  it.each([
    [
      'a released scored class, then a released unscored excused',
      { result_status: 'excused', is_scored: false },
      'c2',
      'Eliminated',
    ],
    [
      'a released unscored disqualified',
      { result_status: 'disqualified', is_scored: false },
      'c2',
      'Eliminated',
    ],
    [
      "a pulled entry's DQ",
      { result_status: 'disqualified', is_scored: false, check_in_status: 'pulled' },
      'c2',
      null,
    ],
    [
      "a scratched entry's DQ",
      { result_status: 'disqualified', is_scored: false, entry_status: 'scratched' },
      'c2',
      null,
    ],
    ['an unreleased DQ', { result_status: 'disqualified', is_scored: false }, 'c-hidden', null],
  ] as const)('%s', (_name, over, classId, expected) => {
    const board = build([
      entry({ armband: '1', class_id: 'c1', points_earned: 10 }),
      entry({ armband: '1', class_id: classId, ...over }),
    ]);
    expect(board[0]!.status).toBe(expected);
  });

  it('Withdrawn wins over Eliminated', () => {
    expect(
      statusOf(
        { ...out, result_status: 'excused' },
        { ...toRun, result_status: 'disqualified', is_scored: false }
      )
    ).toBe('Withdrawn');
  });
});

describe('one eligibility rule, shared with the Results class list (MYK9-1516)', () => {
  const scoredThenOut = (over: Record<string, unknown>) =>
    build([
      entry({ armband: '1', class_id: 'c1', points_earned: 40 }),
      entry({ armband: '1', class_id: 'c2', points_earned: 30, ...over }),
      entry({ armband: '2', class_id: 'c1', points_earned: 50 }),
    ]);

  it.each([
    ['entry_status', { entry_status: 'withdrawn' }],
    ['result_status', { result_status: 'withdrawn' }],
  ])(
    'an entry withdrawn after scoring (%s) is out of the totals and shows Withdrawn',
    (_n, over) => {
      const board = scoredThenOut(over);
      expect(board.map(row => [row.armband, row.totalPoints, row.status])).toEqual([
        ['2', 50, null],
        ['1', 40, 'Withdrawn'],
      ]);
    }
  );

  it('keeps a scored dog that has no armband assigned yet, and shows no armband for it', () => {
    const board = build([
      entry({ armband: null, points_earned: 70 }),
      entry({ armband: '2', points_earned: 50 }),
    ]);
    expect(board.map(row => [row.rank, row.armband, row.totalPoints])).toEqual([
      [1, null, 70],
      [2, '2', 50],
    ]);
  });

  it('counts the same entries as the Results class list', () => {
    const fixture = [
      entry({ armband: '1' }),
      entry({ armband: '2', entry_status: 'withdrawn' }),
      entry({ armband: '3', entry_status: 'scratched' }),
      entry({ armband: '4', entry_status: 'moved' }),
      entry({ armband: '5', entry_status: 'absent' }),
      entry({ armband: '6', entry_status: 'not_accepted' }),
      entry({ armband: '7', entry_status: 'pending' }),
      entry({ armband: '8', check_in_status: 'pulled' }),
      entry({ armband: '9', is_scored: false, result_status: 'pending' }),
    ];
    const classList = buildResultsClassRows({
      trials: [{ id: 't1', showId: 's1', trialDate: '2026-10-10' } as SyncableTrial],
      trialClasses: {
        t1: [{ id: 'c1', name: 'Containers Open', status: 'Completed' } as SyncableTrialClass],
      },
      releasedAtByClassId: new Map([['c1', RELEASED]]),
      entries: fixture,
      paperworkByClassId: new Map(),
    })
      .flatMap(row => row.entries.map(item => item.entryId))
      .sort();
    expect(
      fixture
        .filter(isRankableEntry)
        .map(item => item.id)
        .sort()
    ).toEqual(classList);
  });
});

describe('buildNationalsLeaderboard', () => {
  it('sums each armband across days and keeps points per day', () => {
    const [row] = build([
      entry({ class_id: 'c1', points_earned: 10, search_time_seconds: 60.4 }),
      entry({ class_id: 'c2', points_earned: 15, search_time_seconds: 30 }),
      entry({ class_id: 'c2', points_earned: 5, search_time_seconds: 10 }),
    ]);
    expect(row).toMatchObject({
      armband: '101',
      dogName: 'Rex',
      handlerName: 'Jane Doe',
      totalPoints: 30,
      dayPoints: { 1: 10, 2: 20, 3: null },
    });
    expect(row!.totalTimeSeconds).toBeCloseTo(100.4);
  });

  it("leaves a pulled or scratched entry's earlier score out of the totals and the ranks", () => {
    const board = build([
      entry({ armband: '1', class_id: 'c1', points_earned: 50 }),
      entry({ armband: '1', class_id: 'c2', points_earned: 40, check_in_status: 'pulled' }),
      entry({ armband: '1', class_id: 'c3', points_earned: 30, entry_status: 'scratched' }),
      entry({ armband: '2', class_id: 'c1', points_earned: 60 }),
      entry({ armband: '3', class_id: 'c2', points_earned: 99, check_in_status: 'pulled' }),
    ]);
    expect(board.map(row => [row.rank, row.armband, row.totalPoints])).toEqual([
      [1, '2', 60],
      [2, '1', 50],
    ]);
  });

  it('keeps the fractions of a second the sort ranks on', () => {
    const board = build([
      entry({ armband: '1', points_earned: 10, search_time_seconds: 80.5 }),
      entry({ armband: '2', points_earned: 10, search_time_seconds: 80.25 }),
    ]);
    expect(board.map(row => row.armband)).toEqual(['2', '1']);
    expect(board.map(row => formatSecondsAsMSSCC(row.totalTimeSeconds))).toEqual([
      '1:20.25',
      '1:20.50',
    ]);
  });

  it('counts only scored entries in released classes', () => {
    const board = build([
      entry({ armband: '1', class_id: 'c-hidden', points_earned: 99 }),
      entry({ armband: '2', is_scored: false, points_earned: 99 }),
      entry({ armband: '3', class_id: 'c1', points_earned: 7 }),
    ]);
    expect(board.map(row => row.armband)).toEqual(['3']);
  });

  it('marks Eliminated over a plain row', () => {
    const board = build([
      entry({ armband: '1', points_earned: 30, result_status: 'excused' }),
      entry({ armband: '3', points_earned: 10 }),
    ]);
    expect(board.map(row => [row.armband, row.status])).toEqual([
      ['1', 'Eliminated'],
      ['3', null],
    ]);
  });

  it('lists a withdrawn dog with no released score nowhere, and an empty show as empty', () => {
    expect(build([entry({ entry_status: 'withdrawn', is_scored: false })])).toEqual([]);
    expect(build([])).toEqual([]);
  });
});
