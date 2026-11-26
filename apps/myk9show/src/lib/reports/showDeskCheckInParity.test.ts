import { describe, expect, it } from 'vitest';
import { buildShowMapTree } from '@/features/show-map/showMapTree';
import {
  classEntriesForClass,
  runStatusDisplay,
} from '@/features/show-map/cockpit/cockpitClassEntries';
import { selectPacketPages, toScoresheetModel } from './toScoresheetModel';
import type { ReportDataSet } from './types';
import type { DbClass, DbEntry, DbTrial } from '@/types/database-mappings';
import type { Show } from '@/types/show-types';

// MYK9-2376: Show Desk's class table and the Check-in & Running Order sheet list the same dogs,
// with the same status for every dog that is not running and no run order for it.

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
const classData = {
  id: 'class-1',
  trial_id: trial.id,
  element: 'Exterior',
  level: 'Excellent',
  section: 'A',
  class_number: null,
  display_order: 1,
  time_limit_seconds: 120,
  num_areas: 1,
  status: 'scheduled',
} as unknown as DbClass;

function entry(armband: number, fields: Record<string, unknown>): DbEntry {
  return {
    id: `entry-${armband}`,
    class_id: classData.id,
    armband,
    run_order: armband,
    handler: 'Jamie Walker',
    entry_status: 'confirmed',
    check_in_status: 'no-status',
    dog: { call_name: `Dog${armband}`, breed: 'Beagle' },
    ...fields,
  } as unknown as DbEntry;
}

const MIXED = [
  entry(101, { entry_status: 'withdrawn' }),
  entry(102, { entry_status: 'submitted' }),
  entry(103, { entry_status: 'confirmed' }),
  entry(104, { entry_status: 'withdrawn', check_in_status: 'pulled' }),
  entry(105, { check_in_status: 'pulled' }),
  entry(106, { entry_status: 'confirmed', check_in_status: 'checked-in' }),
  entry(107, { entry_status: 'not_accepted' }),
  entry(108, { entry_status: 'moved' }),
  // Paid but not yet accepted stays Pending (owner decision, isPendingEntryStatus).
  entry(109, { entry_status: 'paid' }),
];

function showDeskRows(entries: DbEntry[]) {
  const tree = buildShowMapTree({
    show: { id: 'show-1', name: 'Show', organization: 'AKC' } as never,
    trials: [{ id: 'trial-1', trialDate: '2026-04-12', trialNumber: '1' } as never],
    classes: [
      { id: 'class-1', trialId: 'trial-1', element: 'Exterior', level: 'Excellent' } as never,
    ],
    entries: entries.map(row => ({ ...row, armband: String(row.armband) })) as never,
    entryPreviewLimit: Number.POSITIVE_INFINITY,
  });
  return classEntriesForClass('class-1', tree).map(row => ({
    armband: String(row.armband ?? ''),
    place: row.place,
    notRunning: row.place === null && row.state !== 'scored' ? runStatusDisplay(row).label : '',
  }));
}

function sheetRows(entries: DbEntry[], kind: 'check-in' | 'score-recording') {
  const dataset: ReportDataSet = { show, pages: [{ trial, classData, entries }] };
  return selectPacketPages(toScoresheetModel(dataset, 'run-order'), kind).pages.flatMap(page =>
    page.entries.map(item => ({
      armband: String(item.armband ?? ''),
      runOrder: item.runOrderDisplay,
      notRunning: item.notRunningLabel ?? '',
    }))
  );
}

describe('Show Desk and the Check-in Sheet list the same dogs (MYK9-2376)', () => {
  it('lists the same armbands, running dogs first, in one order', () => {
    const desk = showDeskRows(MIXED).map(row => row.armband);
    const sheet = sheetRows(MIXED, 'check-in').map(row => row.armband);
    expect(desk).toEqual(sheet);
    expect(desk).toEqual(['103', '106', '101', '102', '104', '105', '109']);
  });

  it('gives a Pending, Withdrawn or Pulled dog the same status and no place or order on both', () => {
    const desk = showDeskRows(MIXED).filter(row => row.place === null);
    const sheet = sheetRows(MIXED, 'check-in').filter(row => row.notRunning);
    expect(desk.map(row => [row.armband, row.notRunning])).toEqual(
      sheet.map(row => [row.armband, row.notRunning])
    );
    expect(sheet.map(row => [row.armband, row.notRunning, row.runOrder])).toEqual([
      ['101', 'Withdrawn', ''],
      ['102', 'Pending', ''],
      ['104', 'Withdrawn', ''],
      ['105', 'Pulled', ''],
      ['109', 'Pending', ''],
    ]);
  });

  it('keeps Pending, Withdrawn and Pulled dogs off the Score Sheet, which lists only runners', () => {
    expect(sheetRows(MIXED, 'score-recording').map(row => row.armband)).toEqual(['103', '106']);
  });
});
