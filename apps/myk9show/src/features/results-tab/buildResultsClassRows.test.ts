import { describe, expect, it } from 'vitest';

import type { SecretaryCockpitPaperwork } from '@/features/show-map/cockpit/secretaryCockpitTypes';
import type { SecretaryEntry } from '@/services/database/entries';
import type { SyncableTrial, SyncableTrialClass } from '@/store/trial-store-types';
import {
  buildResultsClassRows,
  pickResultsPaperwork,
  resultsPaperworkPrinted,
} from './buildResultsClassRows';

const SYNC = {
  _version: 1,
  _lastModified: new Date(0),
  _lastModifiedBy: '',
  _syncStatus: 'synced',
} as const;

const trial = {
  id: 'trial-1',
  showId: 'show-1',
  showName: 'Fall Trial',
  trialDate: '2026-10-10',
  trialNumber: '1',
  status: 'Scheduled',
  ...SYNC,
} as SyncableTrial;

function trialClass(id: string, overrides: Partial<SyncableTrialClass> = {}): SyncableTrialClass {
  return {
    id,
    element: 'Containers',
    level: 'Novice',
    section: '',
    judgeId: 'judge-1',
    judgeName: 'Pat Judge',
    startTime: '09:00',
    status: 'Completed',
    entries: 0,
    ...SYNC,
    ...overrides,
  } as SyncableTrialClass;
}

/** The fields the secretary read carries; the rest of the wide row is irrelevant here. */
function entry(id: string, classId: string, fields: Record<string, unknown> = {}): SecretaryEntry {
  return {
    id,
    class_id: classId,
    entry_status: 'confirmed',
    check_in_status: 'checked-in',
    is_scored: false,
    result_status: 'pending',
    armband: null,
    final_placement: null,
    search_time_seconds: null,
    total_faults: null,
    dog: { id: `dog-${id}`, name: `Dog ${id}`, call_name: null },
    handler: null,
    handler_person: null,
    ...fields,
  } as unknown as SecretaryEntry;
}

const scored = (id: string, classId: string, fields: Record<string, unknown> = {}) =>
  entry(id, classId, { is_scored: true, ...fields });

function paperwork(
  reportId: string,
  state: SecretaryCockpitPaperwork['state']
): SecretaryCockpitPaperwork {
  return { reportId, label: reportId, state };
}

describe('buildResultsClassRows', () => {
  it('projects scores, placement order and counts from the secretary entry read', () => {
    const rows = buildResultsClassRows({
      trials: [trial],
      trialClasses: {
        'trial-1': [trialClass('class-1', { actualFinishTime: '2026-10-10T15:30:00Z' })],
      },
      releasedAtByClassId: new Map(),
      paperworkByClassId: new Map(),
      entries: [
        entry('e-pending', 'class-1', { armband: '103' }),
        scored('e-nq', 'class-1', { armband: '102', result_status: 'nq', total_faults: 2 }),
        scored('e-2nd', 'class-1', {
          armband: '104',
          result_status: 'qualified',
          final_placement: 2,
          search_time_seconds: 75.5,
        }),
        scored('e-1st', 'class-1', {
          armband: '101',
          result_status: 'qualified',
          final_placement: 1,
          search_time_seconds: 61.25,
          total_faults: 0,
          dog: { id: 'd', name: 'Ranger', call_name: 'Rex' },
          handler_person: { id: 'p', first_name: 'Jane', last_name: 'Doe' },
        }),
      ],
    });

    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row).toMatchObject({
      id: 'class-1',
      name: 'Containers Novice',
      trialLabel: 'Trial 1',
      judgeName: 'Pat Judge',
      finishedAt: '2026-10-10T15:30:00Z',
      expectedCount: 4,
      scoredCount: 3,
      qualifiedCount: 2,
      phase: 'in-ring',
    });
    expect(row?.entries.map(item => item.entryId)).toEqual(['e-1st', 'e-2nd', 'e-nq', 'e-pending']);
    expect(row?.entries[0]).toEqual({
      entryId: 'e-1st',
      armband: '101',
      dogName: 'Rex',
      handlerName: 'Jane Doe',
      placement: 1,
      resultLabel: 'Q',
      qualified: true,
      timeLabel: '1:01.25',
      faults: 0,
      scored: true,
    });
    expect(row?.entries[2]).toMatchObject({ resultLabel: 'NQ', faults: 2, placement: null });
    expect(row?.entries[3]).toMatchObject({ resultLabel: 'Pending', scored: false });
  });

  it('leaves pulled, withdrawn and not-yet-accepted dogs out of both the table and the counts', () => {
    const [row] = buildResultsClassRows({
      trials: [trial],
      trialClasses: { 'trial-1': [trialClass('class-1')] },
      releasedAtByClassId: new Map(),
      paperworkByClassId: new Map(),
      entries: [
        scored('e-ran', 'class-1', { result_status: 'qualified', final_placement: 1 }),
        entry('e-pulled', 'class-1', { check_in_status: 'pulled' }),
        entry('e-withdrawn', 'class-1', { entry_status: 'withdrawn' }),
        entry('e-unaccepted', 'class-1', { entry_status: 'pending' }),
      ],
    });

    expect(row?.entries.map(item => item.entryId)).toEqual(['e-ran']);
    expect(row).toMatchObject({ expectedCount: 1, scoredCount: 1, phase: 'ready-to-release' });
  });

  it('reads a class whose every dog was pulled as having nothing to release', () => {
    const [row] = buildResultsClassRows({
      trials: [trial],
      trialClasses: { 'trial-1': [trialClass('class-1')] },
      releasedAtByClassId: new Map(),
      paperworkByClassId: new Map(),
      entries: [entry('e-pulled', 'class-1', { check_in_status: 'pulled' })],
    });

    expect(row).toMatchObject({ expectedCount: 0, phase: 'no-dogs' });
    expect(row?.nextAction.kind).toBe('none');
  });

  it('reads a cancelled class as cancelled', () => {
    const [row] = buildResultsClassRows({
      trials: [trial],
      trialClasses: { 'trial-1': [trialClass('class-1', { status: 'Cancelled' })] },
      releasedAtByClassId: new Map(),
      paperworkByClassId: new Map(),
      entries: [scored('e-1', 'class-1')],
    });

    expect(row?.phase).toBe('cancelled');
  });

  it('walks a finished class through release and print using the class store stamp and the paperwork map', () => {
    const base = {
      trials: [trial],
      trialClasses: { 'trial-1': [trialClass('class-1')] },
      entries: [scored('e-1', 'class-1', { result_status: 'qualified', final_placement: 1 })],
    };
    const released = new Map([['class-1', '2026-10-10T16:00:00Z']]);
    const printed = new Map([
      [
        'class-1',
        [
          paperwork('check-in-sheet', 'unconfirmed'),
          paperwork('results-sheet', 'current'),
          paperwork('result-labels', 'current'),
        ],
      ],
    ]);
    const stale = new Map([
      ['class-1', [paperwork('results-sheet', 'current'), paperwork('result-labels', 'stale')]],
    ]);

    const phase = (
      releasedAtByClassId: ReadonlyMap<string, string | null>,
      paperworkByClassId: ReadonlyMap<string, readonly SecretaryCockpitPaperwork[]>
    ) => buildResultsClassRows({ ...base, releasedAtByClassId, paperworkByClassId })[0]?.phase;

    expect(phase(new Map(), printed)).toBe('ready-to-release');
    expect(phase(released, new Map())).toBe('released');
    expect(phase(released, stale)).toBe('released');
    expect(phase(released, printed)).toBe('done');
  });

  it('orders trials by date, then classes by schedule time and level', () => {
    const later = {
      ...trial,
      id: 'trial-2',
      trialDate: '2026-10-11',
      trialNumber: '2',
    } as SyncableTrial;
    const rows = buildResultsClassRows({
      trials: [later, trial],
      trialClasses: {
        'trial-1': [
          trialClass('open', { level: 'Open', startTime: '10:00' }),
          trialClass('novice', { startTime: '10:00' }),
        ],
        'trial-2': [trialClass('sunday')],
      },
      releasedAtByClassId: new Map(),
      paperworkByClassId: new Map(),
      entries: [],
    });

    expect(rows.map(row => row.id)).toEqual(['novice', 'open', 'sunday']);
  });
});

describe('results paperwork helpers', () => {
  it('keeps only the results sheet and ribbon labels', () => {
    const items = [
      paperwork('check-in-sheet', 'current'),
      paperwork('results-sheet', 'current'),
      paperwork('result-labels', 'unconfirmed'),
    ];
    expect(pickResultsPaperwork(items).map(item => item.reportId)).toEqual([
      'results-sheet',
      'result-labels',
    ]);
  });

  it('is printed only when both are current, and unknown when history is unreadable', () => {
    expect(
      resultsPaperworkPrinted([
        paperwork('results-sheet', 'current'),
        paperwork('result-labels', 'current'),
      ])
    ).toBe(true);
    expect(resultsPaperworkPrinted([paperwork('results-sheet', 'current')])).toBe(false);
    expect(resultsPaperworkPrinted([])).toBe(false);
    expect(
      resultsPaperworkPrinted([
        paperwork('results-sheet', 'unknown'),
        paperwork('result-labels', 'unknown'),
      ])
    ).toBeNull();
  });
});
