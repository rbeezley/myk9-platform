import { describe, expect, it } from 'vitest';

import { mapReplicatedClassToDbRow } from '@/services/mappers/classMappers';
import { mapReplicatedEntryToDbRow } from '@/services/mappers/entryMappers';
import { rowToEntry } from '@/services/replication/ReplicatedEntriesTable.mapper';
import { rowToClass } from '@/services/replication/ReplicatedClassesTable';
import type { DbClass, DbEntry } from '@/types/database-mappings';

import {
  toFingerprintClassRow,
  toFingerprintEntryRow,
} from '../../../../../../../supabase/functions/remind-print-trial-packet/classPrintRows.ts';
import { buildSheetDescriptorFromRows } from '../../../../../../../supabase/functions/_shared/paperwork/rowDescriptors.ts';
import { buildReportPaperworkDescriptor } from '../buildReportPaperworkDescriptor';

// MYK9-2086 part B. The reminder rebuilds a print's fingerprint on the server from raw rows; the
// app builds it from the replica's rows. A fingerprint hashes the text of every fact, so null,
// undefined and a default string are different prints. These tests push the SAME raw database
// rows through both paths, with the app's real mappers, and require the same fingerprint.

const SHOW_ID = 'show-1';
const TRIAL_ID = 'trial-1';

const rawClasses: Record<string, unknown>[] = [
  {
    id: 'class-full',
    trial_id: TRIAL_ID,
    name: 'Container Novice A',
    element: 'Container',
    level: 'Novice',
    section: 'A',
    status: 'scheduled',
    time_limit_seconds: 180,
    num_areas: 1,
    num_hides: 2,
    // The judge as the replica carries it: a confirmed assignment with the person's name.
    judge_assignments: [
      {
        person_id: 'person-1',
        status: 'confirmed',
        people: { first_name: 'Jo', last_name: 'Judge' },
      },
    ],
  },
  {
    id: 'class-sparse',
    trial_id: TRIAL_ID,
    name: 'Interior Excellent',
    element: 'Interior',
    level: 'Excellent',
    section: null,
    status: null,
    time_limit_seconds: null,
    num_areas: null,
    num_hides: null,
  },
];

const rawEntries: Record<string, unknown>[] = [
  {
    id: 'e1',
    class_id: 'class-full',
    dog_id: 'dog-1',
    armband: '101',
    run_order: 1,
    check_in_status: 'checked-in',
    entry_status: 'confirmed',
  },
  {
    id: 'e2',
    class_id: 'class-full',
    dog_id: 'dog-2',
    armband: '007',
    run_order: null,
    check_in_status: null,
    entry_status: 'confirmed',
  },
  {
    id: 'e3',
    class_id: 'class-sparse',
    dog_id: 'dog-3',
    armband: null,
    run_order: null,
    check_in_status: null,
    entry_status: null,
  },
];

/** The app's real chain: raw row, replica row, the row the reports and the cockpit read. */
function appClasses(raw: readonly Record<string, unknown>[]): DbClass[] {
  return raw.map(
    row =>
      mapReplicatedClassToDbRow(rowToClass(row as never), { entryCount: 1 }) as unknown as DbClass
  );
}
function appEntries(raw: readonly Record<string, unknown>[]): DbEntry[] {
  return raw.map(row => mapReplicatedEntryToDbRow(rowToEntry(row as never)) as unknown as DbEntry);
}

function fingerprints(
  build: (reportId: string, classId: string) => { fingerprint: string; coverage: unknown } | null
) {
  return rawClasses.flatMap(cls =>
    ['check-in-sheet', 'scoresheet'].map(reportId => {
      const descriptor = build(reportId, String(cls.id));
      return { reportId, classId: cls.id, descriptor };
    })
  );
}

const scopeOf = (classId: string) => ({
  kind: 'class' as const,
  showId: SHOW_ID,
  trialId: TRIAL_ID,
  classId,
});

function appFingerprints(classes = rawClasses, entries = rawEntries) {
  const dbClasses = appClasses(classes);
  const dbEntries = appEntries(entries);
  return fingerprints((reportId, classId) =>
    buildReportPaperworkDescriptor({
      reportId,
      scope: scopeOf(classId),
      classes: dbClasses,
      entries: dbEntries,
    })
  );
}

function serverFingerprints(classes = rawClasses, entries = rawEntries) {
  const serverClasses = classes.map(toFingerprintClassRow);
  const serverEntries = entries.map(toFingerprintEntryRow);
  return fingerprints((reportId, classId) =>
    buildSheetDescriptorFromRows({
      reportId,
      scope: scopeOf(classId),
      classes: serverClasses,
      entries: serverEntries,
    })
  );
}

describe('reminder rows hash like the app rows', () => {
  it('gives the same check-in sheet and scoresheet fingerprint for every class', () => {
    const app = appFingerprints();
    const server = serverFingerprints();
    expect(app).toHaveLength(4);
    expect(server.map(item => item.descriptor?.fingerprint)).toEqual(
      app.map(item => item.descriptor?.fingerprint)
    );
    expect(server.map(item => item.descriptor?.coverage)).toEqual(
      app.map(item => item.descriptor?.coverage)
    );
    for (const item of app) expect(item.descriptor).not.toBeNull();
  });

  it('keeps the parity when a class column changes', () => {
    const changed = rawClasses.map(row =>
      row.id === 'class-full' ? { ...row, time_limit_seconds: 240, section: 'B' } : row
    );
    const server = serverFingerprints(changed).map(item => item.descriptor?.fingerprint);
    expect(server).toEqual(appFingerprints(changed).map(item => item.descriptor?.fingerprint));
    // A real change is still a change: the scoresheet prints the class's time limit.
    expect(server).not.toEqual(serverFingerprints().map(item => item.descriptor?.fingerprint));
  });

  it('keeps the parity when an entry changes', () => {
    const changed = rawEntries.map(row =>
      row.id === 'e2' ? { ...row, check_in_status: 'checked-in', run_order: 2 } : row
    );
    expect(serverFingerprints(rawClasses, changed).map(i => i.descriptor?.fingerprint)).toEqual(
      appFingerprints(rawClasses, changed).map(i => i.descriptor?.fingerprint)
    );
  });

  it('pins the two class facts the app never carries: the judge and the hide count', () => {
    // The app's class row has no `judge_name` and no `num_hides` (MYK9-479 dropped the column; the
    // hide count is an official-only RPC the row mapper never writes), so a judge or hide change
    // does not move the app's fingerprint. If this ever changes, the reminder's rows must read
    // them too, and this test is where that shows up first.
    const [row] = appClasses([rawClasses[0]!]) as unknown as Record<string, unknown>[];
    expect(row).not.toHaveProperty('judge_name');
    expect(row).not.toHaveProperty('num_hides');
    const reassigned = rawClasses.map(item =>
      item.id === 'class-full'
        ? {
            ...item,
            num_hides: 5,
            judge_assignments: [
              {
                person_id: 'p9',
                status: 'confirmed',
                people: { first_name: 'Al', last_name: 'B' },
              },
            ],
          }
        : item
    );
    expect(appFingerprints(reassigned).map(item => item.descriptor?.fingerprint)).toEqual(
      appFingerprints().map(item => item.descriptor?.fingerprint)
    );
  });
});
