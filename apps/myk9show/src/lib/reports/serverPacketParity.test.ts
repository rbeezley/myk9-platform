import { describe, expect, it } from 'vitest';
import { buildPacketEntries } from '@/pages/secretary/ReportsPage/buildPacketData';
import { buildEmergencyPacketModel } from '../../../../../supabase/functions/_shared/trialPacket/renderer/emergencyTrialPacket.ts';
import { applySheetEntryRule } from '../../../../../supabase/functions/_shared/trialPacket/renderer/packetInputEntries.ts';
import type {
  EmergencyPacketInput,
  PacketReportEntry,
} from '../../../../../supabase/functions/_shared/trialPacket/renderer/types.ts';
import type { DbClass, DbEntry, DbTrial } from '@/types/database-mappings';

/**
 * MYK9-2389: the saved Before-trial packet (server: `emergency_packet_input` + `applySheetEntryRule`)
 * and the Reports sheets (app: `buildPacketEntries`) list the same dogs, with the same statuses and
 * the same catalog membership, for one mixed-status class.
 */
const trial = {
  id: 'trial-1',
  date: '2026-04-12',
  trial_number: 1,
  registry_id: 'AKC',
  name: null,
} as unknown as DbTrial;

const classRow = {
  id: 'class-1',
  trial_id: trial.id,
  element: 'Container',
  level: 'Novice',
  section: 'A',
  display_order: 1,
  time_limit_seconds: 120,
  num_areas: 1,
  status: 'scheduled',
} as unknown as DbClass;

// [armband, entry_status, check_in_status, result_status]
const CASES: ReadonlyArray<[number, string, string, string | null]> = [
  [1, 'confirmed', 'no-status', null],
  [2, 'moved', 'no-status', null],
  [3, 'withdrawn', 'no-status', null],
  [4, 'scratched', 'pulled', null],
  [5, 'submitted', 'no-status', null],
  [6, 'not_accepted', 'no-status', null],
  [7, 'absent', 'no-status', null],
  [8, 'paid', 'no-status', null],
  [9, 'confirmed', 'pulled', null],
  [10, 'promotion-expired', 'no-status', null],
  [11, 'confirmed', 'no-status', 'absent'],
  [12, 'confirmed', 'checked-in', 'withdrawn'],
  [13, 'withdrawn', 'pulled', null],
  [14, 'confirmed', 'checked-in', 'qualified'],
];

const appRows = CASES.map(
  ([armband, entryStatus, checkInStatus, resultStatus]) =>
    ({
      id: `entry-${armband}`,
      class_id: classRow.id,
      armband,
      run_order: armband,
      handler: 'Jamie Walker',
      entry_status: entryStatus,
      check_in_status: checkInStatus,
      result_status: resultStatus,
      dog: { call_name: `Dog${armband}`, breed: 'Beagle' },
    }) as unknown as DbEntry
);

const serverInput: EmergencyPacketInput = {
  show: {
    id: 'show-1',
    name: 'Spring Trial',
    clubName: 'Demo Club',
    organization: 'AKC',
    startDate: '2026-04-12',
    endDate: '2026-04-12',
  },
  trials: [{ id: trial.id, date: '2026-04-12', name: 'Trial 1', trialNumber: '1' }],
  classes: [
    {
      id: classRow.id,
      trialId: trial.id,
      name: 'Container Novice A',
      element: 'Container',
      level: 'Novice',
      section: 'A',
      judgeName: 'Pat Donovan',
    },
  ],
  // The RPC's shape: the row fields plus the three raw statuses the migration adds.
  entries: CASES.map(([armband, entryStatus, checkInStatus, resultStatus]) => ({
    id: `entry-${armband}`,
    armband: String(armband),
    runOrder: armband,
    callName: `Dog${armband}`,
    breed: 'Beagle',
    handler: 'Jamie Walker',
    registrationNumber: null,
    section: null,
    classId: classRow.id,
    trialId: trial.id,
    entryStatus,
    checkInStatus,
    resultStatus,
  })) as unknown as PacketReportEntry[],
} as EmergencyPacketInput;

const STATUS_KEYS = new Set(['entryStatus', 'checkInStatus', 'resultStatus']);

function ruleView(entries: readonly PacketReportEntry[]) {
  return entries
    .map(entry => ({
      id: entry.id,
      notRunningLabel: entry.notRunningLabel ?? null,
      omitFromCatalog: entry.omitFromCatalog === true,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

describe('saved Before-trial packet follows the Reports sheet rule (MYK9-2389)', () => {
  const server = applySheetEntryRule(serverInput);

  it('lists the same dogs with the same statuses and catalog membership as the Reports sheets', () => {
    const app = buildPacketEntries(appRows as never, [trial], [classRow]);
    expect(ruleView(server.entries)).toEqual(ruleView(app));
  });

  it('strips the raw statuses, so the renderer input matches what the app hands it', () => {
    for (const entry of server.entries) {
      expect(entry).not.toHaveProperty('entryStatus');
      expect(entry).not.toHaveProperty('checkInStatus');
      expect(entry).not.toHaveProperty('resultStatus');
    }
  });

  it('prints runners first on the check-in sheet and only runners on the scoresheet', () => {
    const model = buildEmergencyPacketModel(server, { snapshotMarker: false });
    const rows = (kind: string) =>
      model.pages
        .filter(page => page.kind === kind)
        .flatMap(page => page.entries.map(item => [item.armband, item.notRunningLabel ?? '']));
    expect(rows('check-in')).toEqual([
      ['1', ''],
      ['14', ''],
      ['3', 'Withdrawn'],
      ['4', 'Pulled'],
      ['5', 'Pending'],
      ['7', 'Absent'],
      ['8', 'Pending'],
      ['9', 'Pulled'],
      ['10', 'Pending'],
      ['11', 'Absent'],
      ['12', 'Withdrawn'],
      ['13', 'Withdrawn'],
    ]);
    expect(rows('score-recording').map(([armband]) => armband)).toEqual(['1', '14']);
  });

  it('reads an entry without status fields (the RPC before the migration) as a runner', () => {
    const legacy = applySheetEntryRule({
      ...serverInput,
      entries: serverInput.entries.map(
        entry =>
          Object.fromEntries(
            Object.entries(entry).filter(([key]) => !STATUS_KEYS.has(key))
          ) as unknown as PacketReportEntry
      ),
    });
    expect(legacy.entries).toHaveLength(CASES.length);
    expect(legacy.entries.every(entry => !entry.notRunningLabel)).toBe(true);
  });
});
