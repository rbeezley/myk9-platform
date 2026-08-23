import { describe, expect, it } from 'vitest';

import {
  buildArmbandPaperworkDescriptor,
  buildEmergencyPacketPaperworkDescriptor,
  buildCheckInPaperworkDescriptor,
  buildResultPaperworkDescriptor,
  buildScoreSheetPaperworkDescriptor,
  derivePaperworkPrintState,
  type PaperworkDescriptor,
  type PaperworkPrintEvidence,
} from './paperworkPrintState';

const classScope = {
  kind: 'class' as const,
  showId: 'show-1',
  trialId: 'trial-1',
  classId: 'class-1',
};

function evidence(
  id: string,
  descriptor: PaperworkDescriptor,
  printedAt: string,
  overrides: Partial<PaperworkPrintEvidence> = {}
): PaperworkPrintEvidence {
  return {
    id,
    reportId: descriptor.reportId,
    coverage: descriptor.coverage as unknown as Record<string, unknown>,
    fingerprint: descriptor.fingerprint,
    printedAt,
    printedByName: 'Jamie',
    ...overrides,
  };
}

describe('paperwork coverage and fingerprints', () => {
  it('uses document-specific facts and stable subject coverage', () => {
    const checkIn = buildCheckInPaperworkDescriptor(classScope, [
      {
        entryId: 'entry-1',
        classId: 'class-1',
        dogId: 'dog-1',
        armband: 101,
        runOrder: 1,
        checkInStatus: 'checked-in',
      },
    ]);
    const scoreSheet = buildScoreSheetPaperworkDescriptor(
      classScope,
      [
        {
          entryId: 'entry-1',
          classId: 'class-1',
          dogId: 'dog-1',
          armband: 101,
          runOrder: 1,
          checkInStatus: 'checked-in',
          section: 'A',
        },
      ],
      [
        {
          classId: 'class-1',
          trialId: 'trial-1',
          facts: { timeLimitSeconds: 120 },
        },
      ]
    );
    const result = buildResultPaperworkDescriptor('result-labels', classScope, [
      {
        entryId: 'entry-1',
        classId: 'class-1',
        dogId: 'dog-1',
        armband: 101,
        resultStatus: 'qualified',
        placement: 1,
        searchTimeSeconds: 45.2,
        totalFaults: 0,
      },
    ]);
    const armband = buildArmbandPaperworkDescriptor(classScope, [
      {
        dogId: 'dog-1',
        calendarDay: '2026-07-20',
        armband: 101,
        callName: 'Storm',
        handlerName: 'Jamie',
      },
    ]);

    expect(Object.keys(checkIn.coverage.subjectFingerprints)).toEqual(['entry:entry-1']);
    expect(Object.keys(scoreSheet.coverage.subjectFingerprints)).toEqual([
      'class:class-1',
      'entry:entry-1',
    ]);
    expect(result.reportId).toBe('result-labels');
    expect(Object.keys(armband.coverage.subjectFingerprints)).toEqual(['dog-day:dog-1:2026-07-20']);
    expect(new Set([checkIn.fingerprint, scoreSheet.fingerprint, result.fingerprint]).size).toBe(3);
  });

  it('uses a broader batch record as current coverage for one Class', () => {
    const classDescriptor = buildCheckInPaperworkDescriptor(classScope, [
      {
        entryId: 'entry-1',
        classId: 'class-1',
        trialId: 'trial-1',
        dogId: 'dog-1',
        armband: 101,
        runOrder: 1,
        checkInStatus: null,
      },
    ]);
    const trialDescriptor = buildCheckInPaperworkDescriptor(
      { kind: 'trial', showId: 'show-1', trialId: 'trial-1' },
      [
        {
          entryId: 'entry-1',
          classId: 'class-1',
          trialId: 'trial-1',
          dogId: 'dog-1',
          armband: 101,
          runOrder: 1,
          checkInStatus: null,
        },
        {
          entryId: 'entry-2',
          classId: 'class-2',
          trialId: 'trial-1',
          dogId: 'dog-2',
          armband: 102,
          runOrder: 1,
          checkInStatus: null,
        },
      ]
    );
    expect(
      derivePaperworkPrintState(
        [evidence('trial-print', trialDescriptor, '2026-07-20T14:00:00.000Z')],
        classDescriptor
      ).state
    ).toBe('current');
  });

  it('marks only the changed subject stale and ignores irrelevant changes', () => {
    const printed = buildCheckInPaperworkDescriptor(classScope, [
      {
        entryId: 'entry-1',
        classId: 'class-1',
        dogId: 'dog-1',
        armband: 101,
        runOrder: 1,
        checkInStatus: null,
      },
      {
        entryId: 'entry-2',
        classId: 'class-1',
        dogId: 'dog-2',
        armband: 102,
        runOrder: 2,
        checkInStatus: null,
      },
    ]);
    const current = buildCheckInPaperworkDescriptor(classScope, [
      {
        entryId: 'entry-1',
        classId: 'class-1',
        dogId: 'dog-1',
        armband: 101,
        runOrder: 1,
        checkInStatus: null,
      },
      {
        entryId: 'entry-2',
        classId: 'class-1',
        dogId: 'dog-2',
        armband: 102,
        runOrder: 3,
        checkInStatus: null,
      },
    ]);
    const derived = derivePaperworkPrintState(
      [evidence('batch', printed, '2026-07-20T14:00:00.000Z')],
      current
    );
    expect(derived.state).toBe('stale');
    expect(derived.staleSubjectKeys).toEqual(['entry:entry-2']);
  });

  it('marks added and removed covered Entries stale instead of unconfirmed or current', () => {
    const first = {
      entryId: 'entry-1',
      classId: 'class-1',
      trialId: 'trial-1',
      dogId: 'dog-1',
      armband: 101,
      runOrder: 1,
      checkInStatus: null,
    };
    const second = { ...first, entryId: 'entry-2', dogId: 'dog-2', armband: 102, runOrder: 2 };
    const printed = buildCheckInPaperworkDescriptor(classScope, [first]);
    const afterAdd = buildCheckInPaperworkDescriptor(classScope, [first, second]);
    const printedTwo = buildCheckInPaperworkDescriptor(classScope, [first, second]);
    const afterRemove = buildCheckInPaperworkDescriptor(classScope, [first]);

    expect(
      derivePaperworkPrintState(
        [evidence('before-add', printed, '2026-07-20T14:00:00.000Z')],
        afterAdd
      )
    ).toMatchObject({ state: 'stale', staleSubjectKeys: ['entry:entry-2'] });
    expect(
      derivePaperworkPrintState(
        [evidence('before-remove', printedTwo, '2026-07-20T14:00:00.000Z')],
        afterRemove
      )
    ).toMatchObject({ state: 'stale', staleSubjectKeys: ['entry:entry-2'] });
  });

  it('marks score sheets stale when Class lifecycle facts change', () => {
    const entry = {
      entryId: 'entry-1',
      classId: 'class-1',
      trialId: 'trial-1',
      dogId: 'dog-1',
      armband: 101,
      runOrder: 1,
      checkInStatus: null,
    };
    const printed = buildScoreSheetPaperworkDescriptor(
      classScope,
      [entry],
      [
        {
          classId: 'class-1',
          trialId: 'trial-1',
          facts: { status: 'Scheduled', element: 'Container', level: 'Novice' },
        },
      ]
    );
    const current = buildScoreSheetPaperworkDescriptor(
      classScope,
      [entry],
      [
        {
          classId: 'class-1',
          trialId: 'trial-1',
          facts: { status: 'In Progress', element: 'Container', level: 'Novice' },
        },
      ]
    );

    expect(
      derivePaperworkPrintState(
        [evidence('score-sheet', printed, '2026-07-20T14:00:00.000Z')],
        current
      )
    ).toMatchObject({ state: 'stale', staleSubjectKeys: ['class:class-1'] });
  });

  it('prefers a later Class-only reprint and falls back after it is voided', () => {
    const descriptor = buildCheckInPaperworkDescriptor(classScope, [
      {
        entryId: 'entry-1',
        classId: 'class-1',
        dogId: 'dog-1',
        armband: 101,
        runOrder: 1,
        checkInStatus: null,
      },
    ]);
    const broad = evidence('broad', descriptor, '2026-07-20T14:00:00.000Z');
    const classReprint = evidence('class', descriptor, '2026-07-20T14:10:00.000Z');
    expect(derivePaperworkPrintState([broad, classReprint], descriptor).record?.id).toBe('class');
    expect(
      derivePaperworkPrintState(
        [broad, { ...classReprint, voidedAt: '2026-07-20T14:11:00.000Z' }],
        descriptor
      ).record?.id
    ).toBe('broad');
  });

  it('uses truthful unconfirmed wording state when no covering record exists', () => {
    const descriptor = buildCheckInPaperworkDescriptor(classScope, []);
    expect(derivePaperworkPrintState([], descriptor)).toEqual({
      state: 'unconfirmed',
      record: null,
      staleSubjectKeys: [],
    });
  });
});

describe('emergency packet confirmations across trial days (MYK9-228 phase 5)', () => {
  const showId = 'show-1';
  const packet = (trialDate: string, snapshotId: string, trialIds: string[]) =>
    buildEmergencyPacketPaperworkDescriptor({
      showId,
      trialDate,
      snapshotId,
      generatedAt: '2026-10-01T22:00:00.000Z',
      entryIds: ['e1'],
      classIds: ['c1'],
      trialIds,
    });

  const evidence = (descriptor: ReturnType<typeof packet>, printedAt: string) => ({
    id: `print-${printedAt}`,
    reportId: descriptor.reportId,
    coverage: descriptor.coverage as unknown as Record<string, unknown>,
    fingerprint: descriptor.fingerprint,
    printedAt,
    printedByName: 'Secretary',
  });

  it('addresses the confirmation by day, so the server can answer "is Sunday printed?"', () => {
    // A day may hold three trials, so ReportScope cannot carry it and every
    // packet row is show-scoped with a null trial_id. The subject key is the
    // only place the day survives.
    expect(Object.keys(packet('2026-10-04', 's2', ['t2']).coverage.subjectFingerprints)).toEqual([
      'packet-day:2026-10-04',
    ]);
  });

  it('does not let Saturday’s printed packet describe Sunday as merely stale', () => {
    // Both rows are show-scoped, so scopeCovers makes Saturday a candidate for
    // Sunday. Keyed by snapshot id the fingerprints differed and Sunday read
    // STALE — "you printed an older version" — when nobody had printed Sunday
    // at all. That is the difference between "reprint" and "print".
    const saturday = packet('2026-10-03', 'snap-sat', ['t1']);
    const sunday = packet('2026-10-04', 'snap-sun', ['t2']);

    const state = derivePaperworkPrintState([evidence(saturday, '2026-10-02T18:00:00.000Z')], sunday);

    expect(state.state).toBe('unconfirmed');
    expect(state.record).toBeNull();
  });

  it('still calls a reprint stale when the same day is regenerated', () => {
    // The snapshot id and generatedAt stay in the FACTS, so a regeneration of
    // the SAME day changes the fingerprint and the old confirmation goes
    // stale. That distinction is the one the day key was conflating.
    const first = packet('2026-10-03', 'snap-a', ['t1']);
    const regenerated = buildEmergencyPacketPaperworkDescriptor({
      showId,
      trialDate: '2026-10-03',
      snapshotId: 'snap-b',
      generatedAt: '2026-10-02T23:00:00.000Z',
      entryIds: ['e1'],
      classIds: ['c1'],
      trialIds: ['t1'],
    });

    const state = derivePaperworkPrintState(
      [evidence(first, '2026-10-02T18:00:00.000Z')],
      regenerated
    );

    expect(state.state).toBe('stale');
    expect(state.staleSubjectKeys).toEqual(['packet-day:2026-10-03']);
  });

  it('reads a day as printed once its own confirmation exists', () => {
    const sunday = packet('2026-10-04', 'snap-sun', ['t2']);
    const state = derivePaperworkPrintState(
      [
        evidence(packet('2026-10-03', 'snap-sat', ['t1']), '2026-10-02T18:00:00.000Z'),
        evidence(sunday, '2026-10-03T18:00:00.000Z'),
      ],
      sunday
    );
    expect(state.state).toBe('current');
  });

  it('ignores a voided confirmation', () => {
    const sunday = packet('2026-10-04', 'snap-sun', ['t2']);
    const state = derivePaperworkPrintState(
      [{ ...evidence(sunday, '2026-10-03T18:00:00.000Z'), voidedAt: '2026-10-03T19:00:00.000Z' }],
      sunday
    );
    expect(state.state).toBe('unconfirmed');
  });
});
