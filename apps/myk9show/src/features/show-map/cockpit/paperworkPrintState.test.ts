import { describe, expect, it } from 'vitest';

import {
  buildArmbandPaperworkDescriptor,
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
