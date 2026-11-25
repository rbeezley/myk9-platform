import { describe, expect, it } from 'vitest';

import type { DbClass, DbEntry } from '@/types/database-mappings';
import type { ReplicatedPaperworkPrint } from '@/services/replication';

import { buildClassPaperworkMap } from './buildClassPaperworkMap';
import { printedSheetRowsOf } from '@/test/fixtures/printedSheetRows';
import { derivePaperworkPrintState } from './paperworkPrintState';
import { buildReportPaperworkDescriptor } from './buildReportPaperworkDescriptor';

// MYK9-2074: after a print, a move-up (in and out), a late entry or a pull flips exactly the
// classes it touched to stale, for a class printed alone and for a class printed in a trial packet.
const classes = [
  {
    id: 'class-a',
    trial_id: 'trial-1',
    element: 'Container',
    level: 'Novice',
    section: 'A',
    status: 'upcoming',
  },
  { id: 'class-b', trial_id: 'trial-1', element: 'Container', level: 'Advanced', section: 'A' },
  { id: 'class-c', trial_id: 'trial-1', element: 'Interior', level: 'Novice', section: 'A' },
] as unknown as DbClass[];

function entryOf(id: string, classId: string, dogId: string, armband: string, runOrder: number) {
  return {
    id,
    class_id: classId,
    dog_id: dogId,
    armband,
    run_order: runOrder,
    check_in_status: 'no-status',
    entry_status: 'confirmed',
    dog: { call_name: dogId, owner: { first_name: 'Jamie', last_name: 'Walker' } },
  } as unknown as DbEntry;
}

const juni = entryOf('e1', 'class-a', 'dog-1', '101', 1);
const hazel = entryOf('e2', 'class-a', 'dog-2', '102', 2);
const moss = entryOf('e3', 'class-b', 'dog-3', '103', 1);
const pip = entryOf('e4', 'class-c', 'dog-4', '104', 1);
const before = [juni, hazel, moss, pip];

const REPORT_IDS = ['check-in-sheet', 'scoresheet'] as const;
const CLASS_IDS = ['class-a', 'class-b', 'class-c'] as const;

function printRecords(
  entries: readonly DbEntry[],
  classIds: readonly string[]
): ReplicatedPaperworkPrint[] {
  return classIds.flatMap(classId =>
    REPORT_IDS.map(reportId => {
      const scope = { kind: 'class' as const, showId: 'show-1', trialId: 'trial-1', classId };
      const descriptor = buildReportPaperworkDescriptor({
        assignedJudges: [],
        reportId,
        scope,
        classes,
        entries,
        printedSheets: printedSheetRowsOf(classes, entries),
      })!;
      return {
        id: `${reportId}-${classId}`,
        showId: 'show-1',
        trialId: 'trial-1',
        classId,
        scopeKind: 'class',
        reportId,
        coverage: descriptor.coverage,
        fingerprint: descriptor.fingerprint,
        printedBy: 'u1',
        printedByName: 'Jannie',
        printedAt: '2026-12-07T08:00:00Z',
      } as ReplicatedPaperworkPrint;
    })
  );
}

function stateOf(
  entries: readonly DbEntry[],
  records: ReplicatedPaperworkPrint[],
  currentClasses: readonly DbClass[] = classes
) {
  const map = buildClassPaperworkMap({
    assignedJudges: [],
    showId: 'show-1',
    classes: currentClasses,
    trials: [{ id: 'trial-1', trialDate: '2026-12-07' }],
    entries,
    printedSheets: printedSheetRowsOf(currentClasses, entries),
    records,
    returnTo: '/x',
  });
  return Object.fromEntries(
    CLASS_IDS.map(classId => [
      classId,
      REPORT_IDS.map(id => map.get(classId)?.find(item => item.reportId === id)?.state),
    ])
  );
}

function changed(states: ReturnType<typeof stateOf>): string[] {
  return CLASS_IDS.filter(classId => states[classId]!.includes('stale'));
}

// A trial packet print writes the same class-scope records, with the same descriptors, as printing
// each class alone (recordTrialPacketPrint), so one set of records covers both.
describe('classes read changed only when their paperwork changed (MYK9-2074)', () => {
  const records = printRecords(before, CLASS_IDS);

  it('reads every class printed when nothing changed', () => {
    expect(changed(stateOf(before, records))).toEqual([]);
    expect(stateOf(before, records)['class-a']).toEqual(['current', 'current']);
  });

  it('flips the class a late entry joined, and no other', () => {
    const late = entryOf('e9', 'class-a', 'dog-9', '109', 3);
    expect(changed(stateOf([...before, late], records))).toEqual(['class-a']);
  });

  it('flips the class a dog was pulled from, and no other', () => {
    const pulled = { ...hazel, entry_status: 'scratched', check_in_status: 'pulled' } as DbEntry;
    expect(changed(stateOf([juni, pulled, moss, pip], records))).toEqual(['class-a']);
  });

  it('flips both the class a dog moved out of and the class it moved into', () => {
    // The move-up RPC marks the source 'moved' (nothing else) and inserts a new entry in the target.
    const moved = { ...juni, entry_status: 'moved' } as DbEntry;
    const arrived = entryOf('e10', 'class-b', 'dog-1', '101', 2);
    expect(changed(stateOf([moved, hazel, moss, pip, arrived], records))).toEqual([
      'class-a',
      'class-b',
    ]);
  });

  it('reads a class stale when every dog in it was withdrawn after printing', () => {
    const gone = [juni, hazel].map(item => ({ ...item, entry_status: 'withdrawn' }) as DbEntry);
    const states = stateOf([...gone, moss, pip], records);
    expect(states['class-a']).toEqual(['stale', 'stale']);
    expect(changed(states)).toEqual(['class-a']);
  });

  it('does not record an empty class in a show-wide print, and editing it leaves the print current', () => {
    const emptyB = [juni, hazel, pip];
    const showDescriptor = (rows: readonly DbEntry[], rowClasses: readonly DbClass[]) =>
      buildReportPaperworkDescriptor({
        assignedJudges: [],
        reportId: 'scoresheet',
        scope: { kind: 'show', showId: 'show-1' },
        classes: rowClasses,
        entries: rows,
        printedSheets: printedSheetRowsOf(rowClasses, rows),
      })!;
    const printed = showDescriptor(emptyB, classes);
    expect(Object.keys(printed.coverage.subjectFingerprints)).not.toContain('class:class-b');
    const record = {
      id: 'show-print',
      showId: 'show-1',
      trialId: null,
      classId: null,
      scopeKind: 'show',
      reportId: 'scoresheet',
      coverage: printed.coverage,
      fingerprint: printed.fingerprint,
      printedBy: 'u1',
      printedByName: 'Jannie',
      printedAt: '2026-12-07T08:00:00Z',
    } as unknown as ReplicatedPaperworkPrint;
    const edited = classes.map(item =>
      item.id === 'class-b' ? ({ ...item, time_limit_seconds: 300 } as unknown as DbClass) : item
    );
    const states = stateOf(emptyB, [record], edited);
    expect(states['class-a']).toEqual(['unconfirmed', 'current']);
    expect(states['class-b']).toEqual([undefined, undefined]);
    expect(derivePaperworkPrintState([record as never], showDescriptor(emptyB, edited)).state).toBe(
      'current'
    );
  });

  it('offers both sheets for a class whose dogs all sit out: the scoresheet is the one page saying so (MYK9-2387)', () => {
    const gone = [juni, hazel].map(item => ({ ...item, entry_status: 'withdrawn' }) as DbEntry);
    expect(stateOf([...gone, moss, pip], [])['class-a']).toEqual(['unconfirmed', 'unconfirmed']);
  });

  it('flips the class a dog was withdrawn from, and no other', () => {
    const withdrawn = { ...hazel, entry_status: 'withdrawn' } as DbEntry;
    expect(changed(stateOf([juni, withdrawn, moss, pip], records))).toEqual(['class-a']);
  });

  it('keeps printed sheets current when the class starts', () => {
    const started = classes.map(item =>
      item.id === 'class-a' ? ({ ...item, status: 'in_progress' } as unknown as DbClass) : item
    );
    const states = stateOf(before, records, started);
    expect(changed(states)).toEqual([]);
    expect(states['class-a']).toEqual(['current', 'current']);
  });

  it('reads never printed classes as not printed, not changed', () => {
    const states = stateOf(before, []);
    expect(changed(states)).toEqual([]);
    expect(states['class-a']).toEqual(['unconfirmed', 'unconfirmed']);
  });
});
