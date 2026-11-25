import { describe, expect, it } from 'vitest';
import { collateTrialPacket } from '@/features/show-map/cockpit/trialPacket/collateTrialPacket';
import { selectPacketPages, toScoresheetModel } from './toScoresheetModel';
import type { ReportDataSet } from './types';
import { getReportById } from './reportRegistry';
import { printedEntryFacts } from '../../../../../supabase/functions/_shared/paperwork/printedSheet.ts';
import type { DbClass, DbEntry, DbTrial } from '@/types/database-mappings';
import type { Show } from '@/types/show-types';

const show = {
  id: 'show-1',
  name: 'Spring Trial',
  clubName: 'Demo Scent Work Club',
  organization: 'AKC',
  startDate: '2026-04-12',
  endDate: '2026-04-12',
} as Show;

const trial = {
  id: 'trial-1',
  date: '2026-04-12',
  trial_number: 1,
  registry_id: 'AKC',
  event_number: null,
  name: null,
} as unknown as DbTrial;

const classData = (id: string, level: string) =>
  ({
    id,
    trial_id: trial.id,
    element: 'Container',
    level,
    section: 'A',
    class_number: null,
    display_order: 1,
    num_hides: null,
    distraction_count: null,
    time_limit_seconds: 120,
    num_areas: 1,
    status: 'scheduled',
  }) as unknown as DbClass;

const novice = classData('class-novice', 'Novice');
const advanced = classData('class-advanced', 'Advanced');

function entry(
  armband: number,
  classId: string,
  entryStatus: string,
  checkInStatus = 'no-status'
): DbEntry {
  return {
    id: `entry-${armband}`,
    class_id: classId,
    armband,
    run_order: armband,
    handler: 'Jamie Walker',
    entry_status: entryStatus,
    check_in_status: checkInStatus,
    dog: { call_name: `Dog${armband}`, breed: 'Beagle' },
  } as unknown as DbEntry;
}

// 1 confirmed, 2 moved-up source, 3 withdrawn, 4 pulled (scratched + pulled), 5 pending,
// 6 not accepted, 7 absent, 8 accepted, 9 confirmed but pulled at check-in.
const noviceEntries = [
  entry(1, novice.id, 'confirmed'),
  entry(2, novice.id, 'moved'),
  entry(3, novice.id, 'withdrawn'),
  entry(4, novice.id, 'scratched', 'pulled'),
  entry(5, novice.id, 'pending'),
  entry(6, novice.id, 'not_accepted'),
  entry(7, novice.id, 'absent'),
  entry(8, novice.id, 'accepted'),
  entry(9, novice.id, 'confirmed', 'pulled'),
];
// The move-up target: the same dog (armband 2) in the next level up.
const advancedEntries = [entry(2, advanced.id, 'confirmed')];

/** One row per printed dog: armband, the printed order, and the status the row prints. */
function rowsOn(
  dataset: ReportDataSet,
  kind: 'check-in' | 'score-recording',
  sortOrder = 'run-order'
) {
  const model = selectPacketPages(toScoresheetModel(dataset, sortOrder), kind);
  return model.pages.flatMap(page =>
    page.entries.map(item => [item.armband ?? '', item.runOrderDisplay, item.notRunningLabel ?? ''])
  );
}

function catalogRows(dataset: ReportDataSet) {
  return toScoresheetModel(dataset, 'run-order')
    .pages.filter(page => page.kind === 'catalog')
    .flatMap(page => page.entries.map(item => [item.armband ?? '', item.runOrderDisplay]));
}

describe('check-in sheet lists every entry with its status; the scoresheet lists only runners (MYK9-2387)', () => {
  const dataset: ReportDataSet = {
    show,
    pages: [{ trial, classData: novice, entries: noviceEntries }],
  };

  it('prints the check-in sheet with the runners first in run order, then each other entry with its status and no order', () => {
    expect(rowsOn(dataset, 'check-in')).toEqual([
      ['1', '1', ''],
      ['8', '2', ''],
      ['3', '', 'Withdrawn'],
      ['4', '', 'Pulled'],
      ['5', '', 'Pending'],
      ['7', '', 'Absent'],
      ['9', '', 'Pulled'],
    ]);
  });

  it('keeps the non-running rows below the runners when sorted by armband, and still counts only runners', () => {
    expect(rowsOn(dataset, 'check-in', 'armband')).toEqual([
      ['1', '1', ''],
      ['8', '2', ''],
      ['3', '', 'Withdrawn'],
      ['4', '', 'Pulled'],
      ['5', '', 'Pending'],
      ['7', '', 'Absent'],
      ['9', '', 'Pulled'],
    ]);
  });

  it('prints the scoresheet with only the dogs that run', () => {
    expect(rowsOn(dataset, 'score-recording').map(([armband]) => armband)).toEqual(['1', '8']);
  });

  it('never gives a pending or withdrawn dog Order 1, even when its stored run order is first', () => {
    const early = {
      show,
      pages: [
        {
          trial,
          classData: novice,
          entries: [
            { ...entry(1, novice.id, 'pending'), run_order: 1 },
            { ...entry(2, novice.id, 'withdrawn'), run_order: 2 },
            { ...entry(3, novice.id, 'confirmed'), run_order: 3 },
          ] as DbEntry[],
        },
      ],
    } as ReportDataSet;
    expect(rowsOn(early, 'check-in')).toEqual([
      ['3', '1', ''],
      ['1', '', 'Pending'],
      ['2', '', 'Withdrawn'],
    ]);
    expect(rowsOn(early, 'score-recording').map(([armband]) => armband)).toEqual(['3']);
  });

  it('keeps the entry catalog as it was: runners and Pending dogs mixed in run order, never a withdrawn, pulled or absent one', () => {
    expect(catalogRows(dataset)).toEqual([
      ['1', '1'],
      ['5', '2'],
      ['8', '3'],
    ]);
  });

  it('puts a Pending dog in pure armband order in the catalog before run orders exist', () => {
    const unordered: ReportDataSet = {
      show,
      pages: [
        {
          trial,
          classData: novice,
          entries: [
            { ...entry(5, novice.id, 'pending'), run_order: null },
            { ...entry(8, novice.id, 'confirmed'), run_order: null },
            { ...entry(3, novice.id, 'withdrawn'), run_order: null },
          ] as DbEntry[],
        },
      ],
    } as ReportDataSet;
    expect(catalogRows(unordered)).toEqual([
      ['5', ''],
      ['8', ''],
    ]);
  });

  it('keeps a Pending dog stored run order in the catalog Order column', () => {
    const stored: ReportDataSet = {
      show,
      pages: [
        {
          trial,
          classData: novice,
          entries: [
            { ...entry(9, novice.id, 'pending'), run_order: 1 },
            { ...entry(4, novice.id, 'confirmed'), run_order: 2 },
          ] as DbEntry[],
        },
      ],
    } as ReportDataSet;
    expect(catalogRows(stored)).toEqual([
      ['9', '1'],
      ['4', '2'],
    ]);
    // The check-in sheet still lists the runner first and leaves the Pending dog unnumbered.
    expect(rowsOn(stored, 'check-in')).toEqual([
      ['4', '1', ''],
      ['9', '', 'Pending'],
    ]);
  });

  it('still shows the dog in the class it moved up to', () => {
    const target: ReportDataSet = {
      show,
      pages: [{ trial, classData: advanced, entries: advancedEntries }],
    };
    expect(rowsOn(target, 'check-in')).toEqual([['2', '1', '']]);
    expect(rowsOn(target, 'score-recording')).toEqual([['2', '', '']]);
  });

  it('counts only the dogs that run on the judge cover sheet totals', () => {
    const packet = collateTrialPacket({
      show,
      trials: [trial],
      classes: [novice, advanced],
      entries: [...noviceEntries, ...advancedEntries],
      trialId: trial.id,
    });
    const judge = packet?.judges[0];
    const noviceClass = judge?.classes.find(item => item.classId === novice.id);
    expect(noviceClass?.dogCount).toBe(2);
    expect(noviceClass?.runOrder).toEqual(['1', '8']);
    expect(judge?.dogTotal).toBe(3);
  });

  it('keeps a class whose dogs all sit out in the judge packet, with its check-in sheet and the one No dogs are running page', () => {
    const packet = collateTrialPacket({
      show,
      trials: [trial],
      classes: [novice],
      entries: [entry(3, novice.id, 'withdrawn'), entry(5, novice.id, 'pending')],
      trialId: trial.id,
    });
    expect(packet?.emptyClassCount).toBe(0);
    const only = packet?.judges[0]?.classes[0];
    expect(only).toMatchObject({ dogCount: 0, listedCount: 2, runOrder: [] });
    expect(only?.checkInPages).toBe(1);
    expect(only?.scoreSheetPages).toBe(1);
  });

  it('counts a class with nothing to list (a move-up source, a declined entry) as empty, not as a sheet to print', () => {
    const packet = collateTrialPacket({
      show,
      trials: [trial],
      classes: [novice],
      entries: [entry(2, novice.id, 'moved'), entry(6, novice.id, 'not_accepted')],
      trialId: trial.id,
    });
    expect(packet?.emptyClassCount).toBe(1);
    expect(packet?.judges).toHaveLength(0);
  });
});

describe('what prints when a class has no running dog (MYK9-2387)', () => {
  const dataset: ReportDataSet = {
    show,
    pages: [
      {
        trial,
        classData: novice,
        entries: [entry(3, novice.id, 'withdrawn'), entry(5, novice.id, 'pending')],
      },
    ],
  };

  it('lists both dogs on the check-in sheet with their status and no order', () => {
    expect(rowsOn(dataset, 'check-in')).toEqual([
      ['3', '', 'Withdrawn'],
      ['5', '', 'Pending'],
    ]);
  });

  it('gives the scoresheet a single page with no dog rows, which says nobody is running', () => {
    const model = selectPacketPages(toScoresheetModel(dataset, 'run-order'), 'score-recording');
    expect(model.pages).toHaveLength(1);
    expect(model.pages[0]?.entries).toEqual([]);
    const bytes = getReportById('scoresheet')?.buildPdf?.(dataset, 'run-order');
    expect(bytes).toBeInstanceOf(Uint8Array);
  });

  it('keeps a dog recorded absent or withdrawn only in its result in the catalog', () => {
    const recorded: ReportDataSet = {
      show,
      pages: [
        {
          trial,
          classData: novice,
          entries: [
            { ...entry(1, novice.id, 'confirmed'), result_status: 'absent' },
            { ...entry(2, novice.id, 'confirmed'), result_status: 'withdrawn' },
            entry(3, novice.id, 'withdrawn'),
          ] as DbEntry[],
        },
      ],
    } as ReportDataSet;
    expect(catalogRows(recorded).map(([armband]) => armband)).toEqual(['1', '2']);
    expect(rowsOn(recorded, 'check-in')).toEqual([
      ['1', '', 'Absent'],
      ['2', '', 'Withdrawn'],
      ['3', '', 'Withdrawn'],
    ]);
  });
});

describe('check-in fingerprint facts (MYK9-2387)', () => {
  const base = {
    id: 'e1',
    classId: 'c1',
    trialId: 't1',
    armband: '101',
    runOrder: 1,
    callName: 'Moss',
    breed: 'Beagle',
    handler: 'Jamie Walker',
    registrationNumber: null,
    section: null,
  };

  it('hashes a running dog exactly as before, with no status key', () => {
    expect(printedEntryFacts(base, 'check-in', 0, 1)).not.toHaveProperty('status');
  });

  it('adds the status a non-running dog prints', () => {
    expect(
      printedEntryFacts({ ...base, notRunningLabel: 'Pending' }, 'check-in', 1, undefined)
    ).toMatchObject({ status: 'Pending', order: '' });
  });
});
