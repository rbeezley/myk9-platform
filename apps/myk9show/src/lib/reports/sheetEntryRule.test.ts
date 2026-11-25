import { describe, expect, it } from 'vitest';
import { notRunningLabel, notRunningReasonOf } from '@myk9/ringside/run-queue';
import { getEntryStatusKind, getStatusLabel } from '@/services/entryDisplay/entryDisplaySelectors';
import { PENDING_NOT_RUNNING_LABEL } from '@/features/emergency-trial-packet/types';
import { isSupersededMoveUpEntry } from '@/features/financial/moneyRoot';
import {
  sheetEntryState,
  SHEET_ABSENT_LABEL,
  SHEET_PULLED_LABEL,
  SHEET_WITHDRAWN_LABEL,
} from '../../../../../supabase/functions/_shared/trialPacket/renderer/sheetEntryRule.ts';
import { selectPacketPages, toScoresheetModel } from './toScoresheetModel';
import type { ReportDataSet } from './types';
import type { DbClass, DbEntry, DbTrial } from '@/types/database-mappings';
import type { Show } from '@/types/show-types';

// Every raw entry_status the app's classifier knows, plus null.
const LIFECYCLE = [
  'confirmed',
  'accepted',
  'paid',
  'scheduled',
  'submitted',
  'pending',
  'draft',
  'no-status',
  'pending-payment',
  'checked-in',
  'at-gate',
  'in-ring',
  'competing',
  'completed',
  'withdrawn',
  'cancelled',
  'not_accepted',
  'rejected',
  'promotion-expired',
  'scratched',
  'absent',
  'moved',
  'move-up-requested',
  'something-new',
  null,
];
const CHECK_IN = [null, 'no-status', 'checked-in', 'at-gate', 'in-ring', 'pulled', 'completed'];

describe('shared sheet entry rule agrees with the app and Show Desk (MYK9-2387)', () => {
  it('uses the words the app shows', () => {
    expect(SHEET_WITHDRAWN_LABEL).toBe(getStatusLabel('withdrawn'));
    expect(SHEET_ABSENT_LABEL).toBe(getStatusLabel('absent'));
    expect(SHEET_PULLED_LABEL).toBe(getStatusLabel('scratched'));
    expect(SHEET_WITHDRAWN_LABEL).toBe(notRunningLabel('withdrawn'));
    expect(SHEET_ABSENT_LABEL).toBe(notRunningLabel('absent'));
    expect(SHEET_PULLED_LABEL).toBe(notRunningLabel('pulled'));
    expect(PENDING_NOT_RUNNING_LABEL).toBe(getStatusLabel('pending'));
  });

  it.each(LIFECYCLE.flatMap(status => CHECK_IN.map(checkIn => [status, checkIn] as const)))(
    'matches notRunningReasonOf and getEntryStatusKind for %s / %s',
    (entryStatus, checkInStatus) => {
      const state = sheetEntryState({ entryStatus, checkInStatus });
      const kind = getEntryStatusKind(entryStatus);
      // The app reads the legacy alias 'cancelled' as withdrawn; Show Desk stores the canonical word.
      const canonical = kind === 'withdrawn' ? 'withdrawn' : entryStatus;
      const reason = notRunningReasonOf(canonical, checkInStatus);

      expect(state.listed).toBe(
        !isSupersededMoveUpEntry({ entryStatus }) && kind !== 'not_accepted'
      );
      if (!state.listed) {
        expect(state.notRunningLabel).toBeNull();
      } else if (reason) {
        expect(state.notRunningLabel).toBe(notRunningLabel(reason));
      } else if (kind === 'pending') {
        expect(state.notRunningLabel).toBe(PENDING_NOT_RUNNING_LABEL);
      } else {
        expect(state.notRunningLabel).toBeNull();
      }
    }
  );

  it('treats a recorded absent or withdrawn result as not running, and withdrawn beats a pull', () => {
    expect(sheetEntryState({ entryStatus: 'confirmed', resultStatus: 'absent' })).toEqual({
      listed: true,
      notRunningLabel: 'Absent',
    });
    expect(
      sheetEntryState({
        entryStatus: 'confirmed',
        checkInStatus: 'pulled',
        resultStatus: 'Withdrawn',
      }).notRunningLabel
    ).toBe('Withdrawn');
    expect(
      sheetEntryState({ entryStatus: 'withdrawn', checkInStatus: 'pulled' }).notRunningLabel
    ).toBe('Withdrawn');
    expect(
      sheetEntryState({ entryStatus: 'confirmed', resultStatus: 'q' }).notRunningLabel
    ).toBeNull();
  });
});

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
  element: 'Container',
  level: 'Novice',
  section: 'A',
  class_number: null,
  display_order: 1,
  time_limit_seconds: 120,
  num_areas: 1,
  status: 'scheduled',
} as unknown as DbClass;

function entry(armband: number, fields: Partial<DbEntry>): DbEntry {
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

function rows(entries: DbEntry[], kind: 'check-in' | 'score-recording') {
  const dataset: ReportDataSet = { show, pages: [{ trial, classData, entries }] };
  return selectPacketPages(toScoresheetModel(dataset, 'run-order'), kind).pages.flatMap(page =>
    page.entries.map(item => [item.armband ?? '', item.runOrderDisplay, item.notRunningLabel ?? ''])
  );
}

describe('printed model for recorded results and pulled-then-withdrawn (MYK9-2387)', () => {
  const mixed = [
    entry(1, {}),
    entry(2, { result_status: 'absent' } as Partial<DbEntry>),
    entry(3, { entry_status: 'withdrawn', check_in_status: 'pulled' }),
    entry(4, { check_in_status: 'pulled' }),
    entry(5, { entry_status: 'pending' }),
  ];

  it('lists a confirmed dog with a recorded absent result as Absent with no order', () => {
    expect(rows(mixed, 'check-in')).toEqual([
      ['1', '1', ''],
      ['2', '', 'Absent'],
      ['3', '', 'Withdrawn'],
      ['4', '', 'Pulled'],
      ['5', '', 'Pending'],
    ]);
  });

  it('keeps all of them off the scoresheet', () => {
    expect(rows(mixed, 'score-recording').map(([armband]) => armband)).toEqual(['1']);
  });
});
