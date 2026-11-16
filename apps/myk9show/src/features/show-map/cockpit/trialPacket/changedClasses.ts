import type { DbClass, DbEntry } from '@/types/database-mappings';
import type { ReplicatedPaperworkPrint } from '@/services/replication';

import { buildClassPaperworkMap } from '../buildClassPaperworkMap';
import { withJudgeTotals, type CollatedTrialPacket } from './collateTrialPacket';
import { PACKET_REPORT_IDS } from './packetReports';

export type PacketPrintStatus =
  /** The print history is still being read. Nothing is said yet. */
  | { kind: 'loading' }
  /** The print history could not be read, so nothing can be said about what needs printing. */
  | { kind: 'unknown' }
  | {
      kind: 'known';
      /** Printed, then changed (a move-up, a late entry, a pull, a withdrawal). */
      changedIds: ReadonlySet<string>;
      /** Never printed (or the print was undone). */
      unprintedIds: ReadonlySet<string>;
      /** Changed or unprinted: what still needs printing. */
      needIds: ReadonlySet<string>;
      /** Classes in the packet. */
      total: number;
      /** Classes that were printed, then changed, and now have no dogs to print. */
      changedEmptyCount: number;
    };

const isPacketReport = (reportId: string) =>
  (PACKET_REPORT_IDS as readonly string[]).includes(reportId);

/**
 * Which classes in the packet still need printing, from the same per-class records and
 * fingerprints the class cards read (MYK9-2074). A class whose check-in sheet or scoresheets read
 * stale is "changed since printing"; one that reads not confirmed is "not printed yet".
 */
export function packetPrintStatus(input: {
  showId: string;
  packet: CollatedTrialPacket;
  classes: readonly DbClass[];
  entries: readonly DbEntry[];
  records: readonly ReplicatedPaperworkPrint[] | undefined;
  recordsLoading: boolean;
  recordsUnavailable: boolean;
}): PacketPrintStatus {
  if (input.recordsUnavailable) return { kind: 'unknown' };
  if (input.records === undefined || input.recordsLoading) return { kind: 'loading' };
  const byClass = buildClassPaperworkMap({
    showId: input.showId,
    classes: input.classes,
    trials: [{ id: input.packet.trial.id, trialDate: input.packet.trial.date ?? '' }],
    entries: input.entries,
    records: input.records,
    returnTo: '',
  });
  const changedIds = new Set<string>();
  const unprintedIds = new Set<string>();
  let total = 0;
  for (const judge of input.packet.judges) {
    for (const { classId } of judge.classes) {
      total += 1;
      const states = (byClass.get(classId) ?? [])
        .filter(item => isPacketReport(item.reportId))
        .map(item => item.state);
      if (states.includes('stale')) changedIds.add(classId);
      else if (states.some(state => state !== 'current')) unprintedIds.add(classId);
    }
  }
  const printedBefore = new Set(
    input.records
      .filter(
        record =>
          !record.voidedAt &&
          record.classId &&
          isPacketReport(record.reportId) &&
          record.scopeKind === 'class'
      )
      .map(record => record.classId as string)
  );
  return {
    kind: 'known',
    changedIds,
    unprintedIds,
    needIds: new Set([...changedIds, ...unprintedIds]),
    total,
    changedEmptyCount: input.packet.emptyClassIds.filter(id => printedBefore.has(id)).length,
  };
}

/** The packet holding only the given classes; a judge left with none is dropped. */
export function onlyPacketClasses(
  packet: CollatedTrialPacket,
  classIds: ReadonlySet<string>
): CollatedTrialPacket {
  return {
    ...packet,
    judges: packet.judges
      .map(judge => ({
        ...judge,
        classes: judge.classes.filter(item => classIds.has(item.classId)),
      }))
      .filter(judge => judge.classes.length > 0)
      .map(withJudgeTotals),
  };
}
