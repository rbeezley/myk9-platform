import { describe, expect, it } from 'vitest';

import type { DbClass, DbEntry } from '@/types/database-mappings';
import type { ReplicatedPaperworkPrint } from '@/services/replication';

import { printedSheetRowsOf } from '@/test/fixtures/printedSheetRows';
import { buildClassPaperworkMap } from './buildClassPaperworkMap';
import { buildReportPaperworkDescriptor } from './buildReportPaperworkDescriptor';

// MYK9-2116: the class's confirmed judge is a fingerprint input for the check-in sheet and the
// scoresheet, and a judge not loaded yet is hashed as printed (unresolved), then corrects on load.
const REPORT_IDS = ['check-in-sheet', 'scoresheet'] as const;
const entries = [
  {
    id: 'e1',
    class_id: 'class-a',
    dog_id: 'dog-1',
    armband: '101',
    run_order: 1,
    check_in_status: 'no-status',
    entry_status: 'confirmed',
    dog: { call_name: 'Juni' },
  },
] as unknown as DbEntry[];

function classWith(extra: Record<string, unknown>): DbClass {
  return {
    id: 'class-a',
    trial_id: 'trial-1',
    element: 'Container',
    level: 'Novice',
    section: 'A',
    num_hides: 2,
    ...extra,
  } as unknown as DbClass;
}

function judge(first: string, last: string) {
  return {
    judge_assignments: [
      {
        person_id: `${first}-id`,
        status: 'confirmed',
        people: { first_name: first, last_name: last },
      },
    ],
  };
}

function printed(classItem: DbClass): ReplicatedPaperworkPrint[] {
  return REPORT_IDS.map(reportId => {
    const scope = {
      kind: 'class' as const,
      showId: 'show-1',
      trialId: 'trial-1',
      classId: 'class-a',
    };
    const descriptor = buildReportPaperworkDescriptor({
      assignedJudges: [],
      reportId,
      scope,
      classes: [classItem],
      entries,
      printedSheets: printedSheetRowsOf([classItem], entries),
    })!;
    return {
      id: reportId,
      showId: 'show-1',
      trialId: 'trial-1',
      classId: 'class-a',
      scopeKind: 'class',
      reportId,
      coverage: descriptor.coverage,
      fingerprint: descriptor.fingerprint,
      printedBy: 'u1',
      printedByName: 'Jannie',
      printedAt: '2026-12-07T08:00:00Z',
    } as ReplicatedPaperworkPrint;
  });
}

function cardOf(
  classItem: DbClass,
  records: ReplicatedPaperworkPrint[],
  assignedJudges: [] | undefined
) {
  const map = buildClassPaperworkMap({
    assignedJudges,
    showId: 'show-1',
    classes: [classItem],
    trials: [{ id: 'trial-1', trialDate: '2026-12-07' }],
    entries,
    printedSheets: printedSheetRowsOf([classItem], entries),
    records,
    returnTo: '/x',
  });
  return Object.fromEntries(
    REPORT_IDS.map(id => {
      const item = map.get('class-a')?.find(row => row.reportId === id);
      return [id, { state: item?.state, hasConfirmation: item?.confirmation !== undefined }];
    })
  );
}

describe('class judge in the paperwork fingerprints (MYK9-2116)', () => {
  const original = classWith(judge('Pat', 'Donovan'));
  const records = printed(original);

  it('reads current when nothing changed', () => {
    expect(cardOf(original, records, [])).toEqual({
      'check-in-sheet': { state: 'current', hasConfirmation: true },
      scoresheet: { state: 'current', hasConfirmation: true },
    });
  });

  it('a judge change after printing turns the check-in sheet and the scoresheet stale', () => {
    const states = cardOf(classWith(judge('Sam', 'Reed')), records, []);
    expect(states['check-in-sheet']?.state).toBe('stale');
    expect(states.scoresheet?.state).toBe('stale');
  });

  it('a print recorded with no judge reads changed once the judge loads (the paper lacks it)', () => {
    const noJudge = classWith({ judge_resolved: true });
    expect(
      cardOf(classWith(judge('Pat', 'Donovan')), printed(noJudge), [])['scoresheet']?.state
    ).toBe('stale');
  });

  it('a class with no judge once the lookup ran is a known state', () => {
    const none = classWith({ judge_resolved: true });
    expect(cardOf(none, printed(none), [])['scoresheet']?.state).toBe('current');
  });

  it('hides changes the scoresheet fingerprint and not the check-in sheet', () => {
    const fingerprint = (reportId: string, hides: number) =>
      buildReportPaperworkDescriptor({
        assignedJudges: [],
        reportId,
        scope: { kind: 'class', showId: 'show-1', trialId: 'trial-1', classId: 'class-a' },
        classes: [classWith({ ...judge('Pat', 'Donovan'), num_hides: hides })],
        entries,
        printedSheets: printedSheetRowsOf(
          [classWith({ ...judge('Pat', 'Donovan'), num_hides: hides })],
          entries
        ),
      })?.fingerprint;
    expect(fingerprint('check-in-sheet', 1)).toBe(fingerprint('check-in-sheet', 3));
    expect(fingerprint('scoresheet', 1)).not.toBe(fingerprint('scoresheet', 3));
  });
});
