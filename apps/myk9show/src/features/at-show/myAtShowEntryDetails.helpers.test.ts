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

const trialWithLabel: ReadonlyMap<string, AtShowTrialSummary> = new Map([
  ['trial-1', { date: '2026-09-27', timezone: 'America/Chicago', label: 'Trial 2 · Sun, Sep 27' }],
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
      // A class summary with no `selfCheckinState` answer yet is 'unknown' —
      // never 'allowed' — so a class the cascade hasn't resolved never
      // exposes Check In on its own (MYK9-800 follow-up P1 fix).
      selfCheckinState: 'unknown',
    });
  });

  it("carries a class's resolved self-check-in cascade onto the entry detail (MYK9-800 follow-up)", () => {
    const withDisabledCheckin = new Map<string, AtShowClassSummary>([
      [
        'class-1',
        {
          className: 'Novice Container',
          classStatus: 'in_progress',
          selfCheckinState: 'not-allowed',
        },
      ],
    ]);

    const details = buildMyAtShowEntryDetails(
      entries,
      new Set(['entry-1']),
      withDisabledCheckin,
      noTrials
    );

    expect(details[0]).toMatchObject({ selfCheckinState: 'not-allowed' });
  });

  it("carries an 'allowed' resolved cascade onto the entry detail", () => {
    const withAllowedCheckin = new Map<string, AtShowClassSummary>([
      [
        'class-1',
        { className: 'Novice Container', classStatus: 'in_progress', selfCheckinState: 'allowed' },
      ],
    ]);

    const details = buildMyAtShowEntryDetails(
      entries,
      new Set(['entry-1']),
      withAllowedCheckin,
      noTrials
    );

    expect(details[0]).toMatchObject({ selfCheckinState: 'allowed' });
  });

  it("carries the trial's rendered heading onto the entry detail so the row can show trial date + number (MYK9-800 walk finding #2)", () => {
    const withTrialId: ReplicatedEntry[] = [
      { id: 'entry-t1', showId: 'show-1', classId: 'class-1', trialId: 'trial-1', isScored: false },
    ];

    const details = buildMyAtShowEntryDetails(
      withTrialId,
      new Set(['entry-t1']),
      classesById,
      trialWithLabel,
      new Date('2026-09-27T17:00:00Z') // midday Chicago on the trial's own date, well clear of the day-filter's midnight edge
    );

    expect(details[0]).toMatchObject({ trialLabel: 'Trial 2 · Sun, Sep 27' });
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
        {
          className: `Day ${index + 1} Class`,
          classStatus: 'not_started',
          selfCheckinState: 'allowed' as const,
        },
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
    selfCheckinState: 'allowed',
    trialLabel: null,
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

  // MYK9-800 follow-up: the owner's production walk hit "Check-in failed —
  // ask the secretary to check you in" after tapping a Check In button the
  // page had no business offering. `self_checkin_entry` (the RPC this button
  // calls) refuses the write whenever the class/trial/show visibility
  // cascade has self-check-in off, but `deriveAtShowNextAction` never
  // consulted that cascade before this fix — it offered Check In on
  // `hasRunOrder` alone. This pins the client and the server to the same
  // rule so the button never promises a write the RPC will reject.
  it('never offers a check-in tap the self_checkin_entry RPC would refuse', () => {
    expect(deriveAtShowNextAction({ ...base, selfCheckinState: 'not-allowed' })).toEqual({
      kind: 'self-checkin-disabled',
    });
  });

  // MYK9-800 follow-up P1 (Codex): a batch-query error or an offline device
  // must never fall through to 'check-in' — that is the exact bug the P1
  // caught. This assertion is red on 73dec6f89 (that commit has no
  // 'unknown' state; a missing/errored answer resolves to 'check-in' there)
  // and green after the tri-state fix.
  it('never offers a check-in tap while the cascade is unresolved (error, loading, or offline)', () => {
    expect(deriveAtShowNextAction({ ...base, selfCheckinState: 'unknown' })).toEqual({
      kind: 'self-checkin-unknown',
    });
  });

  it('still waits for the running order before mentioning self-check-in at all', () => {
    // No run order AND self-check-in disabled — the running-order message is
    // the more actionable one (there is nothing to check into yet).
    expect(
      deriveAtShowNextAction({
        ...base,
        hasRunOrder: false,
        className: null,
        selfCheckinState: 'not-allowed',
      })
    ).toEqual({ kind: 'wait-running-order' });
  });

  it('still waits for the running order over an unresolved self-check-in cascade', () => {
    expect(
      deriveAtShowNextAction({
        ...base,
        hasRunOrder: false,
        className: null,
        selfCheckinState: 'unknown',
      })
    ).toEqual({ kind: 'wait-running-order' });
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
