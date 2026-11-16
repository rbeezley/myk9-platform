import type { DbClass, DbEntry } from '@/types/database-mappings';
import type { ReplicatedPaperworkPrint } from '@/services/replication';

import { buildClassPaperworkMap } from '../buildClassPaperworkMap';
import { withJudgeTotals, type CollatedTrialPacket } from './collateTrialPacket';
import { PACKET_REPORT_IDS } from './packetReports';

export type ChangedClasses =
  /** The print history could not be read, so nothing can be said about what changed. */
  { kind: 'unknown' } | { kind: 'known'; classIds: ReadonlySet<string> };

/**
 * The classes in the packet whose check-in sheet or scoresheets read as printed and then
 * changed: the same per-class records and fingerprints the class cards read (MYK9-2074). A class
 * never printed is not "changed since printing".
 */
export function changedPacketClasses(input: {
  showId: string;
  packet: CollatedTrialPacket;
  classes: readonly DbClass[];
  entries: readonly DbEntry[];
  records: readonly ReplicatedPaperworkPrint[] | undefined;
  recordsUnavailable: boolean;
}): ChangedClasses {
  if (input.recordsUnavailable || input.records === undefined) return { kind: 'unknown' };
  const byClass = buildClassPaperworkMap({
    showId: input.showId,
    classes: input.classes,
    trials: [{ id: input.packet.trial.id, trialDate: input.packet.trial.date ?? '' }],
    entries: input.entries,
    records: input.records,
    returnTo: '',
  });
  const classIds = new Set<string>();
  for (const judge of input.packet.judges) {
    for (const packetClass of judge.classes) {
      const stale = (byClass.get(packetClass.classId) ?? []).some(
        item =>
          (PACKET_REPORT_IDS as readonly string[]).includes(item.reportId) && item.state === 'stale'
      );
      if (stale) classIds.add(packetClass.classId);
    }
  }
  return { kind: 'known', classIds };
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
