import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildMyAtShowEntryDetails,
  deriveAtShowNextAction,
  isExhibitorOnlyForAtShow,
  type AtShowClassSummary,
  type AtShowEntryDetail,
  type AtShowTrialSummary,
} from './myAtShowEntryDetails.helpers';
import type { ReplicatedEntry } from '@/services/replication';
import { UserRole } from '@/types/auth-types';

const noTrials: ReadonlyMap<string, AtShowTrialSummary> = new Map();

const entries: ReplicatedEntry[] = [
  {
    id: 'entry-1',
    showId: 'show-1',
    classId: 'class-1',
    dogCallName: 'Rex',
    armband: '101',
    checkInStatus: 'no-status',
    runOrder: 3,
    isScored: false,
  },
  {
    id: 'entry-2',
    showId: 'show-1',
    classId: 'class-2',
    dogCallName: 'Bella',
    armband: '202',
    checkInStatus: 'checked-in',
    runOrder: undefined,
    isScored: false,
  },
  {
    id: 'entry-3',
    showId: 'show-1',
    classId: undefined,
    dogCallName: 'Duke',
    armband: undefined,
    checkInStatus: 'no-status',
    isScored: true,
  },
  // Not owned — must never appear in the output.
  {
    id: 'entry-unowned',
    showId: 'show-1',
    classId: 'class-1',
    dogCallName: 'Not Mine',
    isScored: false,
  },
];

const classesById = new Map<string, AtShowClassSummary>([
  [
    'class-1',
    {
      className: 'Novice Container',
      classStatus: 'in_progress',
      expectedStartLabel: '10:15 AM',
      isRevisedStart: true,
    },
  ],
]);

describe('buildMyAtShowEntryDetails', () => {
  it('only includes owned entries, in entry order', () => {
    const details = buildMyAtShowEntryDetails(
      entries,
      new Set(['entry-1', 'entry-2', 'entry-3']),
      classesById,
      noTrials
    );

    expect(details.map(d => d.entryId)).toEqual(['entry-1', 'entry-2', 'entry-3']);
  });

  it('resolves class name from the already-loaded class summary map', () => {
    const details = buildMyAtShowEntryDetails(entries, new Set(['entry-1']), classesById, noTrials);

    expect(details[0]).toMatchObject({
      dogName: 'Rex',
      armband: '101',
      className: 'Novice Container',
      expectedStartLabel: '10:15 AM',
      isRevisedStart: true,
      hasRunOrder: true,
    });
  });

  it('leaves className null when the class is not in the summary map yet (running order not posted)', () => {
    const details = buildMyAtShowEntryDetails(entries, new Set(['entry-2']), classesById, noTrials);

    expect(details[0]).toMatchObject({ className: null, hasRunOrder: false });
  });

  it('falls back to a generic dog label when the call name is missing', () => {
    const noNameEntries: ReplicatedEntry[] = [{ id: 'entry-x', showId: 'show-1', isScored: false }];
    const details = buildMyAtShowEntryDetails(
      noNameEntries,
      new Set(['entry-x']),
      classesById,
      noTrials
    );

    expect(details[0]?.dogName).toBe('Your dog');
  });
});

describe('buildMyAtShowEntryDetails — trial-day filtering (MYK9-800)', () => {
  // The seeded 'Heartland Scent Work Week' shape: one trial per day, Fri
  // Sep 25 through Thu Oct 1 2026, America/Chicago — with Willow entered in
  // every trial, exactly as the failing show reported the bug.
  const WEEK_DATES = [
    '2026-09-25',
    '2026-09-26',
    '2026-09-27',
    '2026-09-28',
    '2026-09-29',
    '2026-09-30',
    '2026-10-01',
  ];
  const TIMEZONE = 'America/Chicago';

  function weekEntries(): ReplicatedEntry[] {
    return WEEK_DATES.map((_, index) => ({
      id: `entry-day-${index + 1}`,
      showId: 'show-week',
      classId: `class-day-${index + 1}`,
      trialId: `trial-day-${index + 1}`,
      dogCallName: 'Willow',
      armband: '100',
      checkInStatus: 'no-status',
      runOrder: 3,
      isScored: false,
    }));
  }

  function weekTrials(): ReadonlyMap<string, AtShowTrialSummary> {
    return new Map(
      WEEK_DATES.map((date, index) => [`trial-day-${index + 1}`, { date, timezone: TIMEZONE }])
    );
  }

  function weekClasses(): ReadonlyMap<string, AtShowClassSummary> {
    return new Map(
      WEEK_DATES.map((_, index) => [
        `class-day-${index + 1}`,
        { className: `Day ${index + 1} Class`, classStatus: 'not_started' },
      ])
    );
  }

  const ownEntryIds = new Set(weekEntries().map(e => e.id));

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns exactly the day-2 entry when the clock reads day 2, and never offers check-in for the rest', () => {
    // Midday Chicago on day 2 (Sep 26) — well clear of any midnight edge.
    vi.setSystemTime(new Date('2026-09-26T17:00:00Z'));

    const details = buildMyAtShowEntryDetails(
      weekEntries(),
      ownEntryIds,
      weekClasses(),
      weekTrials()
    );

    expect(details.map(d => d.entryId)).toEqual(['entry-day-2']);
    for (const detail of details) {
      expect(deriveAtShowNextAction(detail)).toEqual({ kind: 'check-in' });
    }
  });

  it('picks the trial day in the TRIAL zone, not the UTC day, right after Chicago midnight rolls over', () => {
    // 02:00 UTC on Sep 26 is 21:00 CDT on Sep 25 — UTC has already rolled to
    // the 26th, but Chicago has not. Day 2 (Sep 26) must NOT show yet.
    vi.setSystemTime(new Date('2026-09-26T02:00:00Z'));
    const beforeChicagoMidnight = buildMyAtShowEntryDetails(
      weekEntries(),
      ownEntryIds,
      weekClasses(),
      weekTrials()
    );
    expect(beforeChicagoMidnight.map(d => d.entryId)).toEqual(['entry-day-1']);

    // 08:00 UTC on Sep 26 is 03:00 CDT on Sep 26 — Chicago has now rolled
    // over, so day 2 becomes the only entry shown.
    vi.setSystemTime(new Date('2026-09-26T08:00:00Z'));
    const afterChicagoMidnight = buildMyAtShowEntryDetails(
      weekEntries(),
      ownEntryIds,
      weekClasses(),
      weekTrials()
    );
    expect(afterChicagoMidnight.map(d => d.entryId)).toEqual(['entry-day-2']);
  });

  it('keeps an entry whose trial has not synced yet rather than hiding it', () => {
    vi.setSystemTime(new Date('2026-09-26T17:00:00Z'));

    const details = buildMyAtShowEntryDetails(
      weekEntries(),
      ownEntryIds,
      weekClasses(),
      new Map() // no trial data available yet
    );

    expect(details.map(d => d.entryId)).toEqual(weekEntries().map(e => e.id));
  });
});

describe('deriveAtShowNextAction', () => {
  const base: AtShowEntryDetail = {
    entryId: 'e',
    classId: 'class-1',
    dogName: 'Rex',
    armband: '101',
    checkInStatus: 'no-status',
    className: 'Novice Container',
    expectedStartLabel: null,
    isRevisedStart: false,
    hasRunOrder: true,
    isScored: false,
  };

  it('recommends check-in when the class is posted and the exhibitor has not checked in', () => {
    expect(deriveAtShowNextAction(base)).toEqual({ kind: 'check-in' });
  });

  it('recommends waiting when the running order is not posted yet', () => {
    expect(deriveAtShowNextAction({ ...base, hasRunOrder: false, className: null })).toEqual({
      kind: 'wait-running-order',
    });
  });

  it('recommends waiting when there is no class id at all', () => {
    expect(deriveAtShowNextAction({ ...base, classId: null, className: null })).toEqual({
      kind: 'wait-running-order',
    });
  });

  it('does not recommend a check-in tap once already checked in', () => {
    expect(deriveAtShowNextAction({ ...base, checkInStatus: 'checked-in' })).toEqual({
      kind: 'view-class',
    });
  });

  it('recommends nothing further once scored', () => {
    expect(
      deriveAtShowNextAction({ ...base, isScored: true, checkInStatus: 'checked-in' })
    ).toEqual({
      kind: 'scored',
    });
  });
});

describe('isExhibitorOnlyForAtShow', () => {
  function hasRoleFrom(roles: UserRole[]) {
    return (role: UserRole) => roles.includes(role);
  }

  it('is true for an exhibitor-only account', () => {
    expect(isExhibitorOnlyForAtShow(hasRoleFrom([UserRole.EXHIBITOR]))).toBe(true);
  });

  it('is false for a secretary who also exhibits (keeps the class-first default)', () => {
    expect(isExhibitorOnlyForAtShow(hasRoleFrom([UserRole.EXHIBITOR, UserRole.SECRETARY]))).toBe(
      false
    );
  });

  it('is false for a judge, club admin, chairman, steward, or site admin', () => {
    for (const staffRole of [
      UserRole.JUDGE,
      UserRole.CLUB_ADMIN,
      UserRole.CHAIRMAN,
      UserRole.STEWARD,
      UserRole.SITE_ADMIN,
    ]) {
      expect(isExhibitorOnlyForAtShow(hasRoleFrom([staffRole]))).toBe(false);
    }
  });

  it('is false for an account without the exhibitor role at all', () => {
    expect(isExhibitorOnlyForAtShow(hasRoleFrom([]))).toBe(false);
  });
});
