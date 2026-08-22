import {
  buildEmergencyPacketPaperworkDescriptor,
  EMERGENCY_PACKET_REPORT_ID,
  type PaperworkDescriptor,
} from '@/features/show-map/cockpit/paperworkPrintState';
import type { EmergencyPacketInput } from '@/features/emergency-trial-packet/types';
import { splitPacketInputByTrialDay } from '@/features/emergency-trial-packet/emergencyTrialPacket';

/**
 * Packets that already exist, whoever made them.
 *
 * Without this the "Mark printed" action only ever appeared for a packet the
 * CURRENT browser session had just generated. Once generation moved to cron
 * (MYK9-228 phase 4) that left the print reminder with no reachable off
 * switch: the secretary opens Reports the morning of the trial, sees no
 * button, and the only way to get one is to press Prepare — which mints a new
 * snapshot and emails every official a second packet. A twice-daily chase
 * whose only escape is causing the duplicate-stack problem the per-day split
 * exists to prevent.
 */

export interface DeliveredPacketSnapshot {
  snapshotId: string;
  trialDate: string | null;
  generatedAt: string;
  pageCount: number;
}

export interface PacketPrintConfirmation {
  reportId: string;
  coverage: { trialDate?: unknown; snapshotId?: unknown } | null;
  voidedAt?: string | null;
}

export type DeliveredPacketPrintState = 'unconfirmed' | 'printed' | 'superseded';

export interface DeliveredPacketRow {
  trialDate: string;
  snapshotId: string;
  generatedAt: string;
  pageCount: number;
  printState: DeliveredPacketPrintState;
  descriptor: PaperworkDescriptor | null;
}

/**
 * Latest packet per trial day, with whether the paper in the box matches it.
 *
 * `superseded` is deliberately distinct from `unconfirmed`: somebody DID print
 * this day, and telling them "not printed" invites a second identical stack.
 * It mirrors what the server now decides — a confirmation naming an older
 * snapshot does not silence the reminder.
 */
export function buildDeliveredPacketRows(input: {
  snapshots: readonly DeliveredPacketSnapshot[];
  confirmations: readonly PacketPrintConfirmation[];
  packetData: Omit<EmergencyPacketInput, 'generatedAt'> | null;
}): DeliveredPacketRow[] {
  const latestByDay = new Map<string, DeliveredPacketSnapshot>();
  for (const snapshot of input.snapshots) {
    // Whole-show packets predate the per-day split and cannot be addressed by
    // day; there is nothing a reminder or a confirmation could key on.
    if (!snapshot.trialDate) continue;
    const existing = latestByDay.get(snapshot.trialDate);
    if (!existing || snapshot.generatedAt > existing.generatedAt) {
      latestByDay.set(snapshot.trialDate, snapshot);
    }
  }

  const live = input.packetData
    ? new Map(
        splitPacketInputByTrialDay({ ...input.packetData, generatedAt: '' }).map(day => [
          day.trialDate,
          day.input,
        ])
      )
    : new Map<string, EmergencyPacketInput>();

  const confirmations = input.confirmations.filter(
    record => record.reportId === EMERGENCY_PACKET_REPORT_ID && !record.voidedAt
  );

  return [...latestByDay.values()]
    .sort((a, b) => a.trialDate!.localeCompare(b.trialDate!))
    .map(snapshot => {
      const trialDate = snapshot.trialDate as string;
      const forDay = confirmations.filter(record => record.coverage?.trialDate === trialDate);
      const printState: DeliveredPacketPrintState = forDay.some(
        record => record.coverage?.snapshotId === snapshot.snapshotId
      )
        ? 'printed'
        : forDay.length > 0
          ? 'superseded'
          : 'unconfirmed';

      const dayInput = live.get(trialDate);
      return {
        trialDate,
        snapshotId: snapshot.snapshotId,
        generatedAt: snapshot.generatedAt,
        pageCount: snapshot.pageCount,
        printState,
        // Without the day's live report data there is nothing to fingerprint,
        // so offer no button rather than write evidence that describes nothing.
        descriptor: dayInput
          ? buildEmergencyPacketPaperworkDescriptor({
              showId: dayInput.show.id,
              trialDate,
              snapshotId: snapshot.snapshotId,
              generatedAt: snapshot.generatedAt,
              entryIds: dayInput.entries.map(entry => entry.id),
              classIds: dayInput.classes.map(classItem => classItem.id),
              trialIds: dayInput.trials.map(trial => trial.id),
            })
          : null,
      };
    });
}
