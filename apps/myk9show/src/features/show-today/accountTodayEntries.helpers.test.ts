import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildFavoriteClassIdsByTrial,
  hydrateAccountTodayEntriesFromReplicatedRows,
  persistAccountTodayClassFavorites,
  type AccountTodayEntryId,
} from './accountTodayEntries.helpers';
import type {
  ReplicatedClass,
  ReplicatedEntry,
  ReplicatedShow,
  ReplicatedTrial,
} from '@/services/replication';

const shows: ReplicatedShow[] = [
  {
    id: 'show-1',
    name: 'Spring Trial',
    organization: 'AKC',
    startDate: '2026-05-30',
    endDate: '2026-05-30',
  },
];

const trials: ReplicatedTrial[] = [
  { id: 'trial-1', showId: 'show-1', name: 'Trial 1', date: '2026-05-30' },
];

const classes: ReplicatedClass[] = [
  {
    id: 'class-1',
    trialId: 'trial-1',
    name: 'Container Novice',
    element: 'Container',
    level: 'Novice',
    startTime: '08:30',
  },
  {
    id: 'class-2',
    trialId: 'trial-1',
    name: 'Interior Advanced',
    element: 'Interior',
    level: 'Advanced',
    startTime: '11:00',
  },
];

const entries: ReplicatedEntry[] = [
  { id: 'owner-entry', showId: 'show-1', classId: 'class-1' },
  { id: 'handler-entry', showId: 'show-1', classId: 'class-2' },
  { id: 'co-owner-entry', showId: 'show-1', classId: 'class-1' },
  { id: 'unrelated-entry', showId: 'show-1', classId: 'class-2' },
];

const ids = (...entryIds: string[]): AccountTodayEntryId[] =>
  entryIds.map(entry_id => ({ entry_id }));

describe('account today entries helpers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it.each([
    ['owner-only', ids('owner-entry'), ['owner-entry']],
    ['handler-only', ids('handler-entry'), ['handler-entry']],
    ['co-owner-only', ids('co-owner-entry'), ['co-owner-entry']],
    ['owner+handler', ids('owner-entry', 'handler-entry'), ['owner-entry', 'handler-entry']],
    ['owner+co-owner', ids('owner-entry', 'co-owner-entry'), ['owner-entry', 'co-owner-entry']],
    [
      'handler+co-owner',
      ids('handler-entry', 'co-owner-entry'),
      ['handler-entry', 'co-owner-entry'],
    ],
    [
      'all-three',
      ids('owner-entry', 'handler-entry', 'co-owner-entry'),
      ['owner-entry', 'handler-entry', 'co-owner-entry'],
    ],
    ['zero-entry', [], []],
  ])('hydrates only RPC-authorized rows for %s', (_, accountEntryIds, expectedIds) => {
    const hydrated = hydrateAccountTodayEntriesFromReplicatedRows(accountEntryIds, {
      entries,
      classes,
      trials,
      shows,
    });

    expect(hydrated.map(row => row.entryId)).toEqual(expectedIds);
  });

  it('keeps RPC-authorized access when replicated rows are cold', () => {
    const hydrated = hydrateAccountTodayEntriesFromReplicatedRows(
      [
        {
          entry_id: 'owner-entry',
          show_id: 'show-1',
          show_name: 'Spring Trial',
          class_id: 'class-1',
          trial_id: 'trial-1',
          class_name: 'Container Novice',
          class_start_time: '08:30',
        },
      ],
      {
        entries: [],
        classes: [],
        trials: [],
        shows: [],
      }
    );

    expect(hydrated).toEqual([
      {
        entryId: 'owner-entry',
        showId: 'show-1',
        showName: 'Spring Trial',
        classId: 'class-1',
        trialId: 'trial-1',
        className: 'Container Novice',
        classStartTime: '08:30',
      },
    ]);
  });

  it('groups pre-favorite class IDs by trial', () => {
    const hydrated = hydrateAccountTodayEntriesFromReplicatedRows(
      ids('owner-entry', 'handler-entry'),
      { entries, classes, trials, shows }
    );

    expect(buildFavoriteClassIdsByTrial(hydrated)).toEqual(
      new Map([['trial-1', new Set(['class-1', 'class-2'])]])
    );
  });

  it('persists pre-favorites without removing existing manual favorites', () => {
    localStorage.setItem('favorites_show-1_trial-1', JSON.stringify(['manual-class']));
    const hydrated = hydrateAccountTodayEntriesFromReplicatedRows(ids('owner-entry'), {
      entries,
      classes,
      trials,
      shows,
    });

    persistAccountTodayClassFavorites('show-1', hydrated);

    expect(JSON.parse(localStorage.getItem('favorites_show-1_trial-1') ?? '[]')).toEqual([
      'manual-class',
      'class-1',
    ]);
  });
});
