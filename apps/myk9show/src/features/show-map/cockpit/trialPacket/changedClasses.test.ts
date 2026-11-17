import { describe, expect, it } from 'vitest';

import { printedSheetRowsOf } from '@/test/fixtures/printedSheetRows';
import type { ReplicatedPaperworkPrint } from '@/services/replication';
import type { DbClass, DbEntry } from '@/types/database-mappings';

import { buildReportPaperworkDescriptor } from '../buildReportPaperworkDescriptor';
import type { CollatedTrialPacket } from './collateTrialPacket';
import { packetPrintStatus } from './changedClasses';

// MYK9-2103: the trial panel reads the same per-class verdicts as the class cards, so a class
// whose printed dogs were all withdrawn is "changed", and a class with no dogs at all is neither.
const classes = ['class-a', 'class-b', 'class-c'].map(
  id => ({ id, trial_id: 'trial-1', element: 'Container', level: id, section: 'A' }) as DbClass
);
const dog = (id: string, classId: string, armband: string, patch: Partial<DbEntry> = {}) =>
  ({
    id,
    class_id: classId,
    dog_id: `dog-${id}`,
    armband,
    run_order: 1,
    check_in_status: 'no-status',
    entry_status: 'confirmed',
    dog: { call_name: id },
    ...patch,
  }) as unknown as DbEntry;
const before = [dog('e1', 'class-a', '101'), dog('e2', 'class-b', '102')];
const packet = {
  trial: { id: 'trial-1', date: '2026-12-07' },
  judges: [{ classes: classes.map(item => ({ classId: item.id })) }],
} as unknown as CollatedTrialPacket;

function records(entries: readonly DbEntry[]): ReplicatedPaperworkPrint[] {
  return ['class-a', 'class-b'].flatMap(classId =>
    (['check-in-sheet', 'scoresheet'] as const).map(reportId => {
      const descriptor = buildReportPaperworkDescriptor({
        assignedJudges: [],
        reportId,
        scope: { kind: 'class', showId: 'show-1', trialId: 'trial-1', classId },
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

function statusAfter(entries: readonly DbEntry[]) {
  const status = packetPrintStatus({
    showId: 'show-1',
    packet,
    classes,
    entries,
    printedSheets: printedSheetRowsOf(classes, entries),
    printedSheetsSettled: true,
    records: records(before),
    recordsLoading: false,
    recordsUnavailable: false,
    assignedJudges: [],
  });
  if (status.kind !== 'known') throw new Error('expected a known status');
  return status;
}

describe('packetPrintStatus with a class that has nothing left to print', () => {
  it('reads a class whose every dog was withdrawn after printing as changed', () => {
    const status = statusAfter([
      dog('e1', 'class-a', '101', { entry_status: 'withdrawn' }),
      before[1]!,
    ]);
    expect([...status.changedIds]).toEqual(['class-a']);
    // class-c never had dogs: no sheet, so neither changed nor unprinted, as on its card.
    expect([...status.unprintedIds]).toEqual([]);
  });

  it('reads nothing changed when nothing changed', () => {
    expect([...statusAfter(before).changedIds]).toEqual([]);
  });
});
