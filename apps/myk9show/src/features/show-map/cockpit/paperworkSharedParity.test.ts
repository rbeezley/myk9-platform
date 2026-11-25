import { describe, expect, it } from 'vitest';
import type { DbClass, DbEntry, DbTrial } from '@/types/database-mappings';
import type { ReportDbEntry, ReportScope } from '@/lib/reports/types';
import type {
  EmergencyPacketClass,
  EmergencyPacketTrial,
  PacketReportEntry,
} from '../../../../../../supabase/functions/_shared/trialPacket/renderer/types.ts';
import { buildSheetDescriptorFromPrinted } from '../../../../../../supabase/functions/_shared/paperwork/printedSheet.ts';
import { buildReportPaperworkDescriptor } from './buildReportPaperworkDescriptor';

// The app derives the renderer's input from database rows (`buildPacket*`); a Deno edge function
// is handed that input by its own RPC. These tests build the SAME sheet both ways and require the
// same fingerprints, so a drift in either path breaks here before it breaks a stored print.
const trials = [
  { id: 'trial-1', date: '2026-12-07', trial_number: '1', name: 'Trial 1', registry_id: 'AKC' },
  { id: 'trial-2', date: '2026-12-08', trial_number: '2', name: 'Trial 2', registry_id: 'UKC' },
] as unknown as DbTrial[];
const classes = [
  {
    id: 'class-1',
    trial_id: 'trial-1',
    element: 'Container',
    level: 'Novice',
    section: 'A',
    status: 'in_progress',
    judge_assignments: [
      {
        person_id: 'p1',
        status: 'confirmed',
        people: { first_name: 'Judge', last_name: 'One' },
      },
    ],
    time_limit_seconds: '180.5',
    num_areas: 1,
    num_hides: 2,
  },
  { id: 'class-2', trial_id: 'trial-2', element: 'Interior', level: 'Excellent', section: null },
] as unknown as DbClass[];
const entries = [
  {
    id: 'e1',
    class_id: 'class-1',
    dog_id: 'd1',
    armband: '12A',
    run_order: 2,
    check_in_status: 'checked-in',
    entry_status: 'confirmed',
    handler: 'Jamie Walker',
    dog: {
      id: 'd1',
      call_name: 'Juni',
      breed: 'Beagle',
      registrations: [{ organization: 'AKC', registration_number: 'AKC-1' }],
    },
  },
  {
    id: 'e2',
    class_id: 'class-1',
    dog_id: 'd2',
    armband: 102,
    run_order: 1,
    check_in_status: null,
    entry_status: 'withdrawn',
    handler: 'Sam Reed',
    dog: { id: 'd2', call_name: 'Moss', breed: 'Basset' },
  },
  {
    id: 'e3',
    class_id: 'class-2',
    dog_id: 'd3',
    armband: null,
    run_order: null,
    check_in_status: 'no-show',
    entry_status: 'confirmed',
    handler: 'Pat Holder',
    dog: { id: 'd3', call_name: 'Nil', breed: '' },
  },
] as unknown as DbEntry[];

/** The renderer input for those rows, written out as the edge function's RPC supplies it. */
const packetTrials: EmergencyPacketTrial[] = [
  { id: 'trial-1', date: '2026-12-07', name: 'Trial 1', trialNumber: '1', registryId: 'AKC' },
  { id: 'trial-2', date: '2026-12-08', name: 'Trial 2', trialNumber: '2', registryId: 'UKC' },
];
const packetClass = (patch: Partial<EmergencyPacketClass>): EmergencyPacketClass => ({
  id: 'x',
  trialId: 'x',
  name: '',
  element: '',
  level: '',
  section: null,
  classNumber: null,
  displayOrder: null,
  judgeName: '',
  ringLabel: null,
  startTime: null,
  timeLimitSeconds: null,
  timeLimitArea2Seconds: null,
  timeLimitArea3Seconds: null,
  numAreas: null,
  numHides: null,
  distractionCount: null,
  ...patch,
});
const packetClasses: EmergencyPacketClass[] = [
  packetClass({
    id: 'class-1',
    trialId: 'trial-1',
    name: 'Container Novice A',
    element: 'Container',
    level: 'Novice',
    section: 'A',
    judgeName: 'Judge One',
    timeLimitSeconds: 180.5,
    numAreas: 1,
    numHides: 2,
  }),
  packetClass({
    id: 'class-2',
    trialId: 'trial-2',
    name: 'Interior Excellent',
    element: 'Interior',
    level: 'Excellent',
    judgeName: 'TBD',
  }),
];
const packetEntry = (patch: Partial<PacketReportEntry>): PacketReportEntry => ({
  id: 'x',
  armband: null,
  runOrder: null,
  callName: '',
  breed: '',
  handler: '',
  registrationNumber: null,
  section: null,
  ...patch,
});
const packetEntries: PacketReportEntry[] = [
  packetEntry({
    id: 'e1',
    classId: 'class-1',
    armband: '12A',
    runOrder: 2,
    callName: 'Juni',
    breed: 'Beagle',
    handler: 'Jamie Walker',
    registrationNumber: 'AKC-1',
  }),
  // MYK9-2387: the withdrawn dog is listed on the check-in sheet, with its status and no order.
  packetEntry({
    id: 'e2',
    classId: 'class-1',
    armband: '102',
    runOrder: null,
    notRunningLabel: 'Withdrawn',
    callName: 'Moss',
    breed: 'Basset',
    handler: 'Sam Reed',
  }),
  packetEntry({
    id: 'e3',
    classId: 'class-2',
    armband: null,
    runOrder: null,
    callName: 'Nil',
    handler: 'Pat Holder',
  }),
];

const scopes: ReportScope[] = [
  { kind: 'class', showId: 's1', trialId: 'trial-1', classId: 'class-1' },
  { kind: 'trial', showId: 's1', trialId: 'trial-2' },
  { kind: 'show', showId: 's1' },
];

// Re-recorded in MYK9-2103: the check-in sheet and scoresheet fingerprints are now the printed
// text (names, breed, handler, registration number, the suffixed armband label, the whole class
// header), not dog id, check-in status, entry status or raw run order. Every earlier value was
// the old row-field hash, so each one changes by design; a print made before this reads changed once.
// MYK9-2387 / MYK9-2377: re-recorded again. The check-in sheet lists the withdrawn dog with its
// status (a running dog has no status key), and a class nobody judges prints "Judge to be announced".
const PINNED: Record<string, string> = {
  'check-in-sheet/class': 'fnv1a64:4db2ea675f50bb2b',
  'check-in-sheet/trial': 'fnv1a64:18861cd3e732947b',
  'check-in-sheet/show': 'fnv1a64:da740880ee4279f9',
  'scoresheet/class': 'fnv1a64:3e07c7ffeb408b94',
  'scoresheet/trial': 'fnv1a64:6cb2ab573f73393f',
  'scoresheet/show': 'fnv1a64:747b5b22fca647ee',
};

describe('app and shared paperwork descriptors agree', () => {
  for (const reportId of ['check-in-sheet', 'scoresheet'] as const) {
    for (const scope of scopes) {
      it(`${reportId} / ${scope.kind}`, () => {
        const app = buildReportPaperworkDescriptor({
          assignedJudges: [],
          reportId,
          scope,
          classes,
          entries,
          printedSheets: {
            trials,
            classes,
            entries: entries as unknown as ReportDbEntry[],
          },
        });
        const shared = buildSheetDescriptorFromPrinted({
          reportId,
          scope,
          trials: packetTrials,
          classes: packetClasses,
          entries: packetEntries,
        });
        expect(app).toEqual(shared);
        expect(app?.fingerprint).toBe(PINNED[`${reportId}/${scope.kind}`]);
      });
    }
  }

  it('lists the withdrawn entry on the check-in sheet only, never on the scoresheet (MYK9-2387)', () => {
    const subjectsOf = (reportId: 'check-in-sheet' | 'scoresheet') =>
      Object.keys(
        buildSheetDescriptorFromPrinted({
          reportId,
          scope: scopes[0]!,
          trials: packetTrials,
          classes: packetClasses,
          entries: packetEntries,
        })?.coverage.subjectFingerprints ?? {}
      );
    expect(subjectsOf('check-in-sheet')).toEqual(['class:class-1', 'entry:e1', 'entry:e2']);
    expect(subjectsOf('scoresheet')).toEqual(['class:class-1', 'entry:e1']);
  });
});
