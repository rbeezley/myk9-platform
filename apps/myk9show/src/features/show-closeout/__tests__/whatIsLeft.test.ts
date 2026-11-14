import { fromAny } from '@total-typescript/shoehorn';
import { describe, expect, it } from 'vitest';

import type { ResultsClassRow } from '@/features/results-tab/buildResultsClassRows';
import type { ResultsClassPhase } from '@/features/results-tab/resultsNextAction';
import { buildCloseoutReadiness } from '@/features/show-workbench/showCloseOutShow';
import type { SyncableClassData, SyncableEntryData } from '@/store/classStore';
import { buildResultsReadinessSummary } from '@/pages/secretary/ResultsControlPage/readinessSummary';
import { calculateResultsRowsLeft } from '../fromResultsRows';
import { calculateWhatIsLeft, countClassesForFilter, type WhatIsLeftClass } from '../whatIsLeft';

const RELEASED = '2026-11-01T20:00:00Z';

function leftClass(overrides: Partial<WhatIsLeftClass> & { id: string }): WhatIsLeftClass {
  return { expectedCount: 4, scoredCount: 4, status: 'completed', ...overrides };
}

function calc(
  classes: WhatIsLeftClass[],
  extra: Partial<Parameters<typeof calculateWhatIsLeft>[0]> = {}
) {
  return calculateWhatIsLeft({
    classes,
    trials: [{ id: 't1', registryId: 'AKC' }],
    entries: [],
    incidents: { reportableCount: 0, urgentCount: 0 },
    submissions: [{ status: 'sent' }],
    ...extra,
  });
}

function row(
  id: string,
  phase: ResultsClassPhase,
  overrides: Partial<ResultsClassRow> = {}
): ResultsClassRow {
  const cancelled = phase === 'cancelled';
  const noDogs = phase === 'no-dogs';
  const released = ['released', 'needs-initials', 'done'].includes(phase);
  return fromAny<ResultsClassRow, unknown>({
    id,
    trialId: 't1',
    phase,
    expectedCount: noDogs || cancelled ? 0 : 4,
    scoredCount: noDogs || cancelled ? 0 : 4,
    releasedAt: released ? RELEASED : null,
    judgeSignedOffAt: phase === 'done' || phase === 'released' ? RELEASED : null,
    takesJudgeSignOff: !cancelled && !noDogs,
    state: { classStatus: cancelled ? 'Cancelled' : 'Completed' },
    ...overrides,
  });
}

describe('calculateWhatIsLeft: a show with a cancelled class and a class with no dogs', () => {
  const classes = [
    leftClass({ id: 'released', releasedAt: RELEASED }),
    leftClass({ id: 'open', releasedAt: null }),
    leftClass({
      id: 'cancelled',
      status: 'Cancelled',
      expectedCount: 0,
      scoredCount: 0,
      releasedAt: null,
    }),
    leftClass({ id: 'empty', expectedCount: 0, scoredCount: 0, releasedAt: null }),
  ];

  it('counts only the class that still has a dog to release', () => {
    expect(calc(classes).unreleasedClassIds).toEqual(['open']);
  });

  it('does not count the cancelled class as unscored, even with a stale count', () => {
    const left = calc([
      leftClass({ id: 'cancelled', status: 'Cancelled', expectedCount: 3, scoredCount: 0 }),
    ]);
    expect(left.unscoredClassIds).toEqual([]);
  });

  it('gives the Visibility sheet, the finish row, the filter chips and the close step the same answer', () => {
    // Visibility settings sheet: the same four classes, from the class and entry stores.
    const storeClasses = [
      { id: 'released', status: 'Completed', results_released_at: RELEASED },
      { id: 'open', status: 'Completed', results_released_at: null },
      { id: 'cancelled', status: 'Cancelled', results_released_at: null },
      { id: 'empty', status: 'Completed', results_released_at: null },
    ].map(cls => fromAny<SyncableClassData, unknown>(cls));
    const storeEntries = ['released', 'open'].flatMap(classId =>
      [1, 2].map(n =>
        fromAny<SyncableEntryData, unknown>({
          id: `${classId}-${n}`,
          classId,
          is_scored: true,
          result_status: 'qualified',
        })
      )
    );
    const sheet = buildResultsReadinessSummary(storeClasses, storeEntries);

    // Results tab: the same classes as rows.
    const rows = [
      row('released', 'released'),
      row('open', 'ready-to-release'),
      row('cancelled', 'cancelled'),
      row('empty', 'no-dogs', { takesJudgeSignOff: false }),
    ];
    const tab = calculateResultsRowsLeft(rows);

    // Close step: the same classes as the close step reads them.
    const close = buildCloseoutReadiness({
      classes: [
        { id: 'released', status: 'completed', entryCount: 4, scoredCount: 4 },
        { id: 'open', status: 'completed', entryCount: 4, scoredCount: 4 },
        { id: 'cancelled', status: 'cancelled', entryCount: 0, scoredCount: 0 },
        { id: 'empty', status: 'completed', entryCount: 0, scoredCount: 0 },
      ],
      entries: [],
      incidents: { reportableCount: 0, urgentCount: 0 },
      submissions: [{ status: 'sent' }],
    });

    expect(sheet.unreleasedClasses).toBe(1);
    expect(tab.unreleasedClassIds).toEqual(['open']);
    expect(tab.releasedAndInitialed).toBe(false);
    expect(countClassesForFilter(tab, 'ready-to-release')).toBe(1);
    expect(countClassesForFilter(tab, 'all')).toBe(4);
    expect(close.concerns).toEqual([]);
  });

  it('does not call the show ready to submit while a class that ran is unreleased', () => {
    const left = calculateResultsRowsLeft([row('open', 'ready-to-release'), row('c', 'cancelled')]);
    expect(left.releasedAndInitialed).toBe(false);
  });

  it('calls the finish row done when every class that ran is released and initialed, ignoring cancelled and empty ones', () => {
    const left = calculateResultsRowsLeft([
      row('a', 'done'),
      row('b', 'released'),
      row('c', 'cancelled'),
      row('d', 'no-dogs', { takesJudgeSignOff: false }),
    ]);
    expect(left.releasedAndInitialed).toBe(true);
    // A class's own Done still needs its paperwork printed, so the two counts differ on purpose.
    expect(left.doneClassIds).toEqual(['a']);
    expect(left.toPrintClassIds).toEqual(['b']);
  });

  it('keeps an all-absent class that owes the judge sign-off in the finish row', () => {
    const left = calculateResultsRowsLeft([
      row('a', 'done'),
      row('b', 'needs-initials', { expectedCount: 0, takesJudgeSignOff: true }),
    ]);
    expect(left.releasedAndInitialed).toBe(false);
    expect(left.needsInitialsClassIds).toEqual(['b']);
  });
});

describe('calculateWhatIsLeft: classes whose counts were not read', () => {
  it('does not call an unread class empty', () => {
    const left = calc([
      leftClass({
        id: 'x',
        status: 'in_progress',
        expectedCount: null,
        scoredCount: null,
        releasedAt: null,
      }),
    ]);
    expect(left.unknownCountClassIds).toEqual(['x']);
    expect(left.unreleasedClassIds).toEqual(['x']);
  });

  it('reports a line no caller data can answer as unknown, not as nothing left', () => {
    const left = calc([leftClass({ id: 'x' })]);
    const line = (kind: string) => left.lines.find(candidate => candidate.kind === kind);
    expect(line('unreleased')?.open).toBeNull();
    expect(line('to-print')?.open).toBeNull();
    expect(line('judge-sign-off')?.open).toBeNull();
  });
});

describe('calculateWhatIsLeft: each registry reads its own duties', () => {
  const dutyKeys = (registryId: string) =>
    calc([leftClass({ id: 'x' })], { trials: [{ id: 't1', registryId }] })
      .lines.filter(line => line.registryId !== undefined)
      .map(line => line.key);

  it('lists the AKC duties and none of UKC or ASCA', () => {
    expect(dutyKeys('AKC')).toEqual(['akc-judge-initials', 'akc-results-file']);
  });

  it('lists the UKC duties and none of AKC or ASCA', () => {
    expect(dutyKeys('UKC')).toEqual(['ukc-judge-signature', 'ukc-paperwork-packet']);
  });

  it('lists the ASCA duties and none of AKC or UKC', () => {
    expect(dutyKeys('ASCA')).toEqual(['asca-judge-signature', 'asca-online-upload']);
  });

  it('counts the judge line from the classes of that registry only', () => {
    const left = calculateWhatIsLeft({
      classes: [
        leftClass({ id: 'akc-class', trialId: 'akc', phase: 'needs-initials' }),
        leftClass({ id: 'ukc-class', trialId: 'ukc', phase: 'needs-initials' }),
      ],
      trials: [
        { id: 'akc', registryId: 'AKC' },
        { id: 'ukc', registryId: 'UKC' },
      ],
      entries: [],
      incidents: null,
      submissions: null,
    });
    const classIdsOf = (key: string) => left.lines.find(line => line.key === key)?.classIds;
    expect(classIdsOf('akc-judge-initials')).toEqual(['akc-class']);
    expect(classIdsOf('ukc-judge-signature')).toEqual(['ukc-class']);
  });

  it('ticks the submission line once a submission is recorded, and leaves it unknown when unread', () => {
    const submission = (submissions: { status: string }[] | null) =>
      calc([leftClass({ id: 'x' })], { submissions }).lines.find(
        line => line.key === 'akc-results-file'
      )?.open;
    expect(submission([{ status: 'sent' }])).toBe(false);
    expect(submission([])).toBe(true);
    expect(submission(null)).toBeNull();
  });
});

describe('the old counts read the one calculation', () => {
  it('the close step words its concerns from the lines, in its order', () => {
    const left = calc(
      [
        leftClass({ id: 'a', status: 'in_progress', scoredCount: 1 }),
        leftClass({ id: 'b', status: 'in_progress', pendingCount: 2 }),
      ],
      { incidents: { reportableCount: 2, urgentCount: 0 }, submissions: [] }
    );
    expect(left.concerns).toEqual([
      '1 class still has unscored entries.',
      '1 class still has entries waiting for review.',
      'No result submission has been recorded for this show.',
      '2 reportable incidents are still in the incident log.',
    ]);
    expect(
      buildCloseoutReadiness({
        classes: [
          { id: 'a', status: 'in_progress', entryCount: 4, scoredCount: 1 },
          { id: 'b', status: 'in_progress', entryCount: 4, scoredCount: 4, pendingCount: 2 },
        ],
        entries: [],
        incidents: { reportableCount: 2, urgentCount: 0 },
        submissions: [],
      }).concerns
    ).toEqual(left.concerns);
  });
});
