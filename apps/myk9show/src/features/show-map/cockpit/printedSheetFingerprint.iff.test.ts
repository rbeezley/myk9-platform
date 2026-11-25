import jsPDF from 'jspdf';
import { describe, expect, it } from 'vitest';

import {
  buildEmergencyTrialPacketPdf,
  type JsPdfConstructor,
} from '@/features/emergency-trial-packet/buildEmergencyTrialPacketPdf';
import { buildEmergencyPacketModel } from '@/features/emergency-trial-packet/emergencyTrialPacket';
import type {
  EmergencyPacketClass,
  EmergencyPacketInput,
  EmergencyPacketTrial,
  PacketReportEntry,
} from '@/features/emergency-trial-packet/types';

import { buildSheetDescriptorFromPrinted } from '../../../../../../supabase/functions/_shared/paperwork/printedSheet.ts';

/**
 * MYK9-2103: the check-in sheet and scoresheet fingerprints change IF AND ONLY IF the text the
 * renderer prints for that class changes. Each field of the renderer's input is mutated, the real
 * renderer is run under a jsPDF text spy, and the printed text is compared with the fingerprint.
 * The exhaustive field maps below fail to compile when a field is added to the input without
 * saying whether, and where, it prints.
 */
type Sheet = 'check-in-sheet' | 'scoresheet';
type Prints = 'check-in' | 'scoresheet' | 'both' | 'none';

const PAGE_KIND: Record<Sheet, 'check-in' | 'score-recording'> = {
  'check-in-sheet': 'check-in',
  scoresheet: 'score-recording',
};

const trials: EmergencyPacketTrial[] = [
  { id: 't1', date: '2026-12-07', name: 'Trial 1', trialNumber: '1', registryId: 'AKC' },
  { id: 't2', date: '2026-12-08', name: 'Trial 2', trialNumber: '2', registryId: 'AKC' },
];

const baseClass = (id: string, trialId: string): EmergencyPacketClass => ({
  id,
  trialId,
  name: 'Unprinted name',
  element: 'Container',
  level: 'Novice',
  section: 'A',
  classNumber: '3',
  displayOrder: 1,
  judgeName: 'Judge One',
  ringLabel: 'Ring 1',
  startTime: '09:00:00',
  timeLimitSeconds: 180,
  timeLimitArea2Seconds: null,
  timeLimitArea3Seconds: null,
  numAreas: 1,
  numHides: 2,
  distractionCount: 1,
});
const classes: EmergencyPacketClass[] = [baseClass('c1', 't1'), baseClass('c2', 't1')];

const baseEntry = (
  id: string,
  classId: string,
  armband: string,
  runOrder: number
): PacketReportEntry => ({
  id,
  armband,
  runOrder,
  callName: `Dog ${armband}`,
  breed: 'Beagle',
  handler: `Handler ${armband}`,
  registrationNumber: `REG-${armband}`,
  section: null,
  classId,
  classElement: 'Container',
  classLevel: 'Novice',
  classSection: 'A',
  trialId: 't1',
  dogId: `dog-${armband}`,
  checkInStatus: 'no-status',
  isScored: false,
  resultText: null,
  searchTimeSeconds: null,
  totalFaults: null,
  finalPlacement: null,
});
const entries: PacketReportEntry[] = [
  baseEntry('e1', 'c1', '101', 1),
  baseEntry('e2', 'c1', '102', 2),
  baseEntry('e3', 'c2', '201', 1),
];

interface EntryMutation {
  prints: Prints;
  /** Absent when the field cannot change on its own (identity), covered by a dedicated test. */
  mutate?: (entry: PacketReportEntry) => Partial<PacketReportEntry>;
}
const ENTRY_FIELDS: Record<keyof PacketReportEntry, EntryMutation> = {
  id: { prints: 'both' },
  armband: { prints: 'both', mutate: () => ({ armband: '101A' }) },
  runOrder: { prints: 'both', mutate: () => ({ runOrder: 5 }) },
  // MYK9-2387: a dog that will not run prints its status on the check-in sheet and leaves the
  // scoresheet, so both sheets change.
  notRunningLabel: { prints: 'both', mutate: () => ({ notRunningLabel: 'Withdrawn' }) },
  // The entry catalog's own flag; neither the check-in sheet nor the scoresheet prints it.
  omitFromCatalog: { prints: 'none', mutate: () => ({ omitFromCatalog: true }) },
  callName: { prints: 'both', mutate: () => ({ callName: 'Renamed' }) },
  breed: { prints: 'both', mutate: () => ({ breed: 'Basset Hound' }) },
  handler: { prints: 'both', mutate: () => ({ handler: 'New Handler' }) },
  registrationNumber: { prints: 'scoresheet', mutate: () => ({ registrationNumber: 'REG-NEW' }) },
  classId: { prints: 'both', mutate: () => ({ classId: 'c2' }) },
  section: { prints: 'none', mutate: () => ({ section: 'Z' }) },
  classElement: { prints: 'none', mutate: () => ({ classElement: 'Interior' }) },
  classLevel: { prints: 'none', mutate: () => ({ classLevel: 'Master' }) },
  classSection: { prints: 'none', mutate: () => ({ classSection: 'B' }) },
  trialId: { prints: 'none', mutate: () => ({ trialId: 't2' }) },
  dogId: { prints: 'none', mutate: () => ({ dogId: 'dog-other' }) },
  checkInStatus: { prints: 'none', mutate: () => ({ checkInStatus: 'checked-in' }) },
  isScored: { prints: 'none', mutate: () => ({ isScored: true }) },
  resultText: { prints: 'none', mutate: () => ({ resultText: 'Q' }) },
  searchTimeSeconds: { prints: 'none', mutate: () => ({ searchTimeSeconds: 33 }) },
  totalFaults: { prints: 'none', mutate: () => ({ totalFaults: 2 }) },
  finalPlacement: { prints: 'none', mutate: () => ({ finalPlacement: 1 }) },
};

interface ClassMutation {
  prints: Prints;
  mutate?: Partial<EmergencyPacketClass>;
}
const CLASS_FIELDS: Record<keyof EmergencyPacketClass, ClassMutation> = {
  id: { prints: 'both' },
  trialId: { prints: 'both', mutate: { trialId: 't2' } },
  // Printed only when the class has no element, level, section or number: not in this fixture.
  name: { prints: 'none', mutate: { name: 'Another name' } },
  element: { prints: 'both', mutate: { element: 'Interior' } },
  level: { prints: 'both', mutate: { level: 'Master' } },
  section: { prints: 'both', mutate: { section: 'B' } },
  classNumber: { prints: 'both', mutate: { classNumber: '4' } },
  // Orders the classes in the stack; it never changes what one class's sheet says.
  displayOrder: { prints: 'none', mutate: { displayOrder: 9 } },
  judgeName: { prints: 'both', mutate: { judgeName: 'Judge Two' } },
  ringLabel: { prints: 'both', mutate: { ringLabel: 'Ring 2' } },
  startTime: { prints: 'none', mutate: { startTime: '13:00:00' } },
  timeLimitSeconds: { prints: 'both', mutate: { timeLimitSeconds: 240 } },
  timeLimitArea2Seconds: {
    prints: 'both',
    mutate: { numAreas: 2, timeLimitArea2Seconds: 90 },
  },
  timeLimitArea3Seconds: {
    prints: 'both',
    mutate: { numAreas: 3, timeLimitArea3Seconds: 60 },
  },
  numAreas: { prints: 'both', mutate: { numAreas: 2 } },
  numHides: { prints: 'scoresheet', mutate: { numHides: 3 } },
  distractionCount: { prints: 'scoresheet', mutate: { distractionCount: 4 } },
  registryId: { prints: 'scoresheet', mutate: { registryId: 'UKC' } },
};

const TRIAL_FIELDS: Record<
  keyof EmergencyPacketTrial,
  { prints: Prints; mutate?: Partial<EmergencyPacketTrial> }
> = {
  id: { prints: 'both' },
  date: { prints: 'both', mutate: { date: '2026-12-09' } },
  name: { prints: 'both', mutate: { name: 'Spring Trial' } },
  // Printed only when the trial has no name.
  trialNumber: { prints: 'none', mutate: { trialNumber: '7' } },
  registryId: { prints: 'scoresheet', mutate: { registryId: 'UKC' } },
  timezone: { prints: 'none', mutate: { timezone: 'America/Chicago' } },
};

interface Rows {
  trials: EmergencyPacketTrial[];
  classes: EmergencyPacketClass[];
  entries: PacketReportEntry[];
}
const baseRows: Rows = { trials, classes, entries };

/** Everything one class's pages of this sheet kind draw, through the real renderer. */
function printedText(sheet: Sheet, rows: Rows, classId: string): string[] {
  const classItem = rows.classes.find(item => item.id === classId)!;
  const input: EmergencyPacketInput = {
    generatedAt: '2026-12-07T08:00:00.000Z',
    show: { id: 's1', name: 'Winter Trial', startDate: '2026-12-07', endDate: '2026-12-08' },
    trials: rows.trials,
    classes: [classItem],
    entries: rows.entries.filter(entry => entry.classId === classId),
  };
  const model = buildEmergencyPacketModel(input, { snapshotMarker: false });
  const pages = model.pages.filter(page => page.kind === PAGE_KIND[sheet]);
  const texts: string[] = [];
  const RecordingJsPdf = function (options: ConstructorParameters<typeof jsPDF>[0]) {
    const real = new jsPDF(options);
    const originalText = real.text.bind(real);
    (real as unknown as { text: typeof real.text }).text = ((
      text: Parameters<typeof real.text>[0],
      x: Parameters<typeof real.text>[1],
      y: Parameters<typeof real.text>[2],
      opts?: Parameters<typeof real.text>[3]
    ) => {
      for (const value of Array.isArray(text) ? text : [text]) texts.push(value);
      return originalText(text, x, y, opts);
    }) as typeof real.text;
    return real;
  } as unknown as JsPdfConstructor;
  buildEmergencyTrialPacketPdf(
    { ...model, pages: pages.map((page, index) => ({ ...page, pageNumber: index + 1 })) },
    RecordingJsPdf
  );
  return texts;
}

function fingerprintOf(sheet: Sheet, rows: Rows, classId: string): string | null {
  const classItem = rows.classes.find(item => item.id === classId)!;
  return (
    buildSheetDescriptorFromPrinted({
      reportId: sheet,
      scope: { kind: 'class', showId: 's1', trialId: classItem.trialId, classId },
      trials: rows.trials,
      classes: rows.classes,
      entries: rows.entries,
    })?.fingerprint ?? null
  );
}

const SHEETS: Sheet[] = ['check-in-sheet', 'scoresheet'];
const printsOn = (prints: Prints, sheet: Sheet) =>
  prints === 'both' ||
  (prints === 'check-in'
    ? sheet === 'check-in-sheet'
    : prints === 'scoresheet' && sheet === 'scoresheet');

/** Asserts the text and the fingerprint moved together, per class, and that the map is right. */
function expectIff(label: string, prints: Prints, mutated: Rows) {
  for (const sheet of SHEETS) {
    let anyTextChange = false;
    for (const classId of ['c1', 'c2']) {
      const textChanged =
        JSON.stringify(printedText(sheet, mutated, classId)) !==
        JSON.stringify(printedText(sheet, baseRows, classId));
      const fingerprintChanged =
        fingerprintOf(sheet, mutated, classId) !== fingerprintOf(sheet, baseRows, classId);
      expect(fingerprintChanged, `${label} on ${sheet}, class ${classId}`).toBe(textChanged);
      anyTextChange ||= textChanged;
    }
    expect(
      anyTextChange,
      `${label} should ${printsOn(prints, sheet) ? '' : 'not '}print on ${sheet}`
    ).toBe(printsOn(prints, sheet));
  }
}

describe('printed sheet fingerprints change iff the printed text changes (MYK9-2103)', () => {
  it.each(Object.entries(ENTRY_FIELDS).filter(([, field]) => field.mutate))(
    'entry field %s',
    (name, field) => {
      expectIff(`entry.${name}`, field.prints, {
        ...baseRows,
        entries: entries.map((entry, index) =>
          index === 0 ? { ...entry, ...field.mutate!(entry) } : entry
        ),
      });
    }
  );

  it.each(Object.entries(CLASS_FIELDS).filter(([, field]) => field.mutate))(
    'class field %s',
    (name, field) => {
      expectIff(`class.${name}`, field.prints, {
        ...baseRows,
        classes: classes.map((item, index) => (index === 0 ? { ...item, ...field.mutate } : item)),
        // A class moved to another trial needs that trial's own entry rows to follow it.
        entries,
      });
    }
  );

  it.each(Object.entries(TRIAL_FIELDS).filter(([, field]) => field.mutate))(
    'trial field %s',
    (name, field) => {
      expectIff(`trial.${name}`, field.prints, {
        ...baseRows,
        trials: trials.map((item, index) => (index === 0 ? { ...item, ...field.mutate } : item)),
      });
    }
  );

  it('entry identity: two dogs with the same order and armband swap ids, and the sheet changes', () => {
    const tied: Rows = {
      ...baseRows,
      entries: [
        { ...baseEntry('a', 'c1', '101', 1), callName: 'First' },
        { ...baseEntry('b', 'c1', '101', 1), callName: 'Second' },
        entries[2]!,
      ],
    };
    const swapped: Rows = {
      ...tied,
      entries: [{ ...tied.entries[0]!, id: 'b' }, { ...tied.entries[1]!, id: 'a' }, entries[2]!],
    };
    for (const sheet of SHEETS) {
      expect(JSON.stringify(printedText(sheet, swapped, 'c1'))).not.toBe(
        JSON.stringify(printedText(sheet, tied, 'c1'))
      );
      expect(fingerprintOf(sheet, swapped, 'c1')).not.toBe(fingerprintOf(sheet, tied, 'c1'));
    }
  });

  it('an entry leaving the sheet (withdrawn, pulled, held) changes both text and fingerprint', () => {
    expectIff('entry removed', 'both', { ...baseRows, entries: entries.slice(1) });
  });

  it('a run order that keeps the sheet order changes neither the text nor the fingerprint', () => {
    expectIff('run order gap', 'none', {
      ...baseRows,
      entries: entries.map(entry => (entry.id === 'e2' ? { ...entry, runOrder: 9 } : entry)),
    });
  });

  it('a blank handler and a blank breed print the same lines the fingerprint hashes', () => {
    expectIff('blank breed', 'both', {
      ...baseRows,
      entries: entries.map((entry, index) => (index === 0 ? { ...entry, breed: '' } : entry)),
    });
  });
});
