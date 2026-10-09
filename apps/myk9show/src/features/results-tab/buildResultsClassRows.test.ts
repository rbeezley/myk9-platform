import { describe, expect, it } from 'vitest';

import { projectHandlerIdentity } from '@/features/registries/handlerIdentity';
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
      releasedAtByClassId: new Map([['class-1', null]]),
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
          handler_identity: { name: 'Jane Doe', person: null, source: 'assigned-person' },
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
      releasedAtByClassId: new Map([['class-1', null]]),
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
      releasedAtByClassId: new Map([['class-1', null]]),
      paperworkByClassId: new Map(),
      entries: [entry('e-pulled', 'class-1', { check_in_status: 'pulled' })],
    });

    expect(row).toMatchObject({ expectedCount: 0, phase: 'no-dogs' });
    expect(row?.nextAction.kind).toBe('none');
  });

  it('reads a class with no release row as release-unknown, never as ready to release', () => {
    const [row] = buildResultsClassRows({
      trials: [trial],
      trialClasses: { 'trial-1': [trialClass('class-1')] },
      releasedAtByClassId: new Map(),
      paperworkByClassId: new Map(),
      entries: [scored('e-1', 'class-1')],
    });

    expect(row).toMatchObject({ phase: 'release-unknown', releasedAt: null });
    expect(row?.nextAction.kind).toBe('none');
  });

  it('reads a cancelled class as cancelled', () => {
    const [row] = buildResultsClassRows({
      trials: [trial],
      trialClasses: { 'trial-1': [trialClass('class-1', { status: 'Cancelled' })] },
      releasedAtByClassId: new Map([['class-1', null]]),
      paperworkByClassId: new Map(),
      entries: [scored('e-1', 'class-1')],
    });

    expect(row?.phase).toBe('cancelled');
  });

  it('walks a finished class through release and print using the class-row release stamp and the paperwork map', () => {
    const base = {
      trials: [trial],
      // Initialed by the judge, so the walk ends at Done (see the sign-off tests below).
      trialClasses: {
        'trial-1': [trialClass('class-1', { judgeSignedOffAt: '2026-10-10T21:00:00Z' })],
      },
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

    expect(phase(new Map([['class-1', null]]), printed)).toBe('ready-to-release');
    expect(phase(released, new Map())).toBe('released');
    expect(phase(released, stale)).toBe('released');
    expect(phase(released, printed)).toBe('done');
  });

  describe('judge sign-off (MYK9-1031 part 2a)', () => {
    const entries = [scored('e-1', 'class-1', { result_status: 'qualified', final_placement: 1 })];
    const released = new Map([['class-1', '2026-10-10T16:00:00Z']]);
    const printed = new Map([
      ['class-1', [paperwork('results-sheet', 'current'), paperwork('result-labels', 'current')]],
    ]);

    function build(classes: SyncableTrialClass[]) {
      return buildResultsClassRows({
        trials: [trial],
        trialClasses: { 'trial-1': classes },
        releasedAtByClassId: new Map(classes.map(cls => [cls.id, '2026-10-10T16:00:00Z'] as const)),
        paperworkByClassId: new Map(
          classes.map(cls => [cls.id, printed.get('class-1') ?? []] as const)
        ),
        entries: classes.map(cls =>
          scored(`e-${cls.id}`, cls.id, { result_status: 'qualified', final_placement: 1 })
        ),
      });
    }

    it('asks for initials once released and printed, when the judge day is over', () => {
      const [row] = build([trialClass('class-1')]);
      expect(row).toMatchObject({ phase: 'needs-initials', judgeSignedOffAt: null });
      expect(row?.nextAction).toEqual({ kind: 'initials', label: 'Initials' });
      expect(row?.phaseLabel).toBe("Needs judge's initials");
    });

    it('does not ask while the same judge still has a class to run that day', () => {
      const [first, second] = buildResultsClassRows({
        trials: [trial],
        trialClasses: {
          'trial-1': [
            trialClass('class-1'),
            trialClass('class-2', { startTime: '13:00', status: 'In Progress' }),
          ],
        },
        releasedAtByClassId: released,
        paperworkByClassId: printed,
        entries: [...entries, entry('e-pending', 'class-2')],
      });
      expect(first?.phase).toBe('done');
      expect(first?.runFinished).toBe(true);
      expect(second?.runFinished).toBe(false);
      expect(first?.judgeDayKey).toBe(second?.judgeDayKey);
    });

    it('is Done once the judge has signed off, and keeps judges apart', () => {
      const [signed, other] = build([
        trialClass('class-1', { judgeSignedOffAt: '2026-10-10T21:00:00Z' }),
        trialClass('class-2', { judgeId: 'judge-2', judgeName: 'Sam Judge' }),
      ]);
      expect(signed?.phase).toBe('done');
      expect(other?.phase).toBe('needs-initials');
      expect(signed?.judgeDayKey).not.toBe(other?.judgeDayKey);
    });

    it('speaks the registry wording: a UKC show asks for the signature', () => {
      const ukcTrial = { ...trial, registryId: 'UKC' } as unknown as SyncableTrial;
      const [row] = buildResultsClassRows({
        trials: [ukcTrial],
        trialClasses: { 'trial-1': [trialClass('class-1')] },
        releasedAtByClassId: released,
        paperworkByClassId: printed,
        entries,
      });
      expect(row?.registryId).not.toBe('AKC');
      expect(row?.phase).toBe('needs-initials');
      expect(row?.nextAction.label).toBe('Signature');
      expect(row?.phaseLabel).toBe('Needs judge signature');
    });

    it('only a Completed class can be recorded', () => {
      const [completed, running] = build([
        trialClass('class-1'),
        trialClass('class-2', { status: 'In Progress' }),
      ]);
      expect(completed?.signOffRecordable).toBe(true);
      expect(running?.signOffRecordable).toBe(false);
    });

    // Same scenario as judgeDaySignOff.test on the Overview tree ("keeps waiting when the empty
    // class has an entry still pending acceptance"): one rule, two surfaces.
    it("a class holding only entries not yet accepted keeps its judge's day open (as on Overview)", () => {
      const [done, waiting] = buildResultsClassRows({
        trials: [trial],
        trialClasses: {
          'trial-1': [
            trialClass('class-1'),
            trialClass('class-2', { startTime: '13:00', status: 'Scheduled' }),
          ],
        },
        releasedAtByClassId: released,
        paperworkByClassId: printed,
        entries: [...entries, entry('e-pending', 'class-2', { entry_status: 'pending' })],
      });
      expect(waiting).toMatchObject({ phase: 'no-dogs', runFinished: false });
      expect(done?.phase).toBe('done');
      expect(done?.runFinished).toBe(true);
    });

    it('a class that is known empty does not hold the day open', () => {
      const [done, empty] = buildResultsClassRows({
        trials: [trial],
        trialClasses: {
          'trial-1': [
            trialClass('class-1'),
            trialClass('class-2', { startTime: '13:00', status: 'Scheduled' }),
          ],
        },
        releasedAtByClassId: released,
        paperworkByClassId: printed,
        entries,
      });
      expect(empty).toMatchObject({ phase: 'no-dogs', runFinished: true });
      expect(done?.phase).toBe('needs-initials');
    });
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
      releasedAtByClassId: new Map([['class-1', null]]),
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

describe('handler display (the canonical handler_identity projection)', () => {
  const build = (fields: Record<string, unknown>) =>
    buildResultsClassRows({
      trials: [trial],
      trialClasses: { 'trial-1': [trialClass('class-1')] },
      releasedAtByClassId: new Map([['class-1', null]]),
      paperworkByClassId: new Map(),
      entries: [scored('e1', 'class-1', fields)],
    })[0]?.entries[0]?.handlerName;

  it('shows the entered handler when the handler changed but handler_id and the joined person are stale', () => {
    const stale = { id: 'p-old', first_name: 'Old', last_name: 'Person' };
    expect(
      build({
        handler: 'New Handler',
        handler_id: 'p-old',
        handler_person: stale,
        handler_identity: projectHandlerIdentity({
          assignedHandlerName: 'New Handler',
          assignedHandlerId: 'p-old',
          assignedHandlerPerson: stale,
          ownerPerson: null,
        }),
      })
    ).toBe('New Handler');
  });

  it('shows the owner when the entry has no handler fields at all', () => {
    const owner = { id: 'p-owner', first_name: 'Olive', last_name: 'Owner' };
    expect(
      build({
        handler: null,
        handler_id: null,
        handler_person: null,
        handler_identity: projectHandlerIdentity({
          assignedHandlerName: null,
          assignedHandlerId: null,
          assignedHandlerPerson: null,
          ownerPerson: owner,
        }),
      })
    ).toBe('Olive Owner');
  });
});

describe('print actions when print status cannot be read', () => {
  it('still offers a print link per report, with unknown state, even with no paperwork rows', () => {
    const [row] = buildResultsClassRows({
      trials: [trial],
      trialClasses: { 'trial-1': [trialClass('class-1')] },
      releasedAtByClassId: new Map([['class-1', '2026-10-10T16:00:00Z']]),
      paperworkByClassId: new Map(),
      paperworkAvailable: false,
      printHrefFor: (classId, trialId, reportId) => `/print/${trialId}/${classId}/${reportId}`,
      entries: [scored('e1', 'class-1')],
    });

    expect(row?.paperwork.map(item => [item.reportId, item.state, item.printHref])).toEqual([
      ['results-sheet', 'unknown', '/print/trial-1/class-1/results-sheet'],
      ['result-labels', 'unknown', '/print/trial-1/class-1/result-labels'],
    ]);
    expect(row?.phase).toBe('released');
  });
});
