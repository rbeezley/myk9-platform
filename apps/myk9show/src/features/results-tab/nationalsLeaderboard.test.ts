import { describe, expect, it } from 'vitest';

import type { SecretaryEntry } from '@/services/database/entries';
import {
  buildNationalsLeaderboard,
  compareLeaderboard,
  competitionDay,
  formatLeaderboardTime,
  isDogWithdrawn,
  leaderboardStatus,
} from './nationalsLeaderboard';

function entry(over: Record<string, unknown>): SecretaryEntry {
  return {
    id: `e-${Math.random()}`,
    class_id: 'c1',
    armband: '101',
    entry_status: 'confirmed',
    is_scored: true,
    result_status: 'qualified',
    points_earned: 0,
    search_time_seconds: 0,
    dog: { id: 'd', name: 'Ranger', call_name: 'Rex' },
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

describe('isDogWithdrawn: withdrawn iff something withdrawn and nothing left to run', () => {
  const scored = { entry_status: 'confirmed', result_status: 'qualified', is_scored: true };
  const toRun = { entry_status: 'confirmed', result_status: 'pending', is_scored: false };
  const out = { entry_status: 'withdrawn', result_status: 'pending', is_scored: false };
  it.each([
    ['one class withdrawn, others still to run', [out, toRun], false],
    ['completed one class, withdrew from the rest', [scored, out, out], true],
    ['withdrawn from everything', [out, out], true],
    ['no withdrawals, all still to run', [toRun, toRun], false],
    ['no withdrawals, all scored', [scored, scored], false],
    ['no withdrawals, mixed scored and to run', [scored, toRun], false],
    [
      'withdrawn after being scored in that class',
      [{ ...scored, entry_status: 'withdrawn' }],
      true,
    ],
  ] as const)('%s', (_name, dogEntries, expected) => {
    expect(isDogWithdrawn(dogEntries)).toBe(expected);
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
    expect(formatLeaderboardTime(row!.totalTimeSeconds)).toBe('01:40');
  });

  it('counts only scored entries in released classes', () => {
    const board = build([
      entry({ armband: '1', class_id: 'c-hidden', points_earned: 99 }),
      entry({ armband: '2', is_scored: false, points_earned: 99 }),
      entry({ armband: '3', class_id: 'c1', points_earned: 7 }),
    ]);
    expect(board.map(row => row.armband)).toEqual(['3']);
  });

  it('marks Withdrawn over Eliminated, and Eliminated over a plain row', () => {
    const board = build([
      entry({ armband: '1', points_earned: 30, result_status: 'excused' }),
      entry({
        armband: '2',
        points_earned: 20,
        result_status: 'disqualified',
        entry_status: 'withdrawn',
      }),
      entry({ armband: '3', points_earned: 10 }),
    ]);
    expect(board.map(row => [row.armband, row.status])).toEqual([
      ['1', 'Eliminated'],
      ['2', 'Withdrawn'],
      ['3', null],
    ]);
  });

  it('shows Withdrawn for a dog that completed a class then withdrew from the rest, and not for one with classes left', () => {
    const board = build([
      entry({ armband: '1', class_id: 'c1', points_earned: 10 }),
      entry({ armband: '1', class_id: 'c2', entry_status: 'withdrawn', is_scored: false }),
      entry({ armband: '2', class_id: 'c1', points_earned: 5 }),
      entry({ armband: '2', class_id: 'c2', entry_status: 'withdrawn', is_scored: false }),
      entry({ armband: '2', class_id: 'c3', is_scored: false, result_status: 'pending' }),
    ]);
    expect(board.map(row => [row.armband, row.status])).toEqual([
      ['1', 'Withdrawn'],
      ['2', null],
    ]);
  });

  it('lists a withdrawn dog with no released score nowhere, and an empty show as empty', () => {
    expect(build([entry({ entry_status: 'withdrawn', is_scored: false })])).toEqual([]);
    expect(build([])).toEqual([]);
  });
});
