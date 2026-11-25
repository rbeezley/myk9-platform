import { formatTrialLabel, parseStoredClockTime } from '@myk9/core';

import { compareClassesByProgression } from '@/features/premium/pdf/bodies/classOrder';
import { getTrialRegistry } from '@/features/registries';
import { buildEmergencyPacketData } from '@/pages/secretary/ReportsPage/buildPacketData';
import { buildPages } from '@/pages/secretary/ReportsPage/reportPreviewPages';
import { lifecycleFor } from '../buildSecretaryCockpitSnapshot';
import { resolveClassJudgeName } from '@/utils/classJudgeDisplay';
import { toScoresheetModel } from '@/lib/reports/toScoresheetModel';
import type { ReportDataSet } from '@/lib/reports/types';
import type { DbClass, DbEntry, DbTrial } from '@/types/database-mappings';
import type { Show } from '@/types/show-types';
import {
  collateJudgePackets,
  summarizeClassSheets,
  type PacketJudge,
  type PacketJudgeClass,
} from '../../../../../../../supabase/functions/_shared/trialPacket/renderer/judgePacketCollation.ts';

// The grouping, order and totals live in the shared renderer (MYK9-2085), so the edge function
// builds the same packet. This file maps the app's rows into that shape and back.
export {
  NO_JUDGE_KEY,
  withJudgeTotals,
} from '../../../../../../../supabase/functions/_shared/trialPacket/renderer/judgePacketCollation.ts';

/** The one-class data the single-class print uses, so both outputs render the same pages. */
interface PacketClassData {
  dataSet: ReportDataSet;
}

/** One class in a judge's packet. */
export type TrialPacketClass = PacketJudgeClass<PacketClassData>;

/** Everything one judge receives for one trial. */
export type TrialPacketJudge = PacketJudge<PacketClassData>;

export interface CollatedTrialPacket {
  trial: DbTrial;
  /** The trial's `YYYY-MM-DD` date, as the cover sheet reads it. */
  trialDate: string | null | undefined;
  trialLabel: string;
  registryName: string;
  judges: TrialPacketJudge[];
  /** Classes with no running dog (none entered, or all Pending, Withdrawn or Pulled): nothing to judge, so no sheets are printed for them. */
  emptyClassCount: number;
  /** Cancelled classes: the cockpit lists no paperwork for them, so none is printed or marked. */
  cancelledClassCount: number;
}

/**
 * Groups one trial's classes into one packet per judge: classes in schedule order, dogs in run
 * order, and a "No judge assigned" packet last for classes nobody has. Reads the same mapped rows
 * the single-class print reads (`toScoresheetModel`), so a packet's pages for a class are the
 * pages its own Print shows.
 */
export function collateTrialPacket(input: {
  show: Show;
  trials: readonly DbTrial[];
  classes: readonly DbClass[];
  entries: readonly DbEntry[];
  trialId: string;
}): CollatedTrialPacket | null {
  const trial = input.trials.find(item => item.id === input.trialId);
  if (!trial) return null;
  const registry = getTrialRegistry(trial);
  const trialClasses = input.classes.filter(classItem => classItem.trial_id === input.trialId);
  // The cockpit's own predicate (classChecklist.ts: a cancelled class has no checklist items).
  const live = trialClasses.filter(
    classItem => lifecycleFor(classItem.status ?? undefined) !== 'cancelled'
  );
  const byId = new Map(live.map(classItem => [classItem.id, classItem]));
  const mapped = buildEmergencyPacketData({
    show: input.show,
    trials: [trial],
    classes: live,
    entries: [],
  });
  const assignedJudges = input.show.assignedJudges ?? [];

  const collated = collateJudgePackets<PacketClassData>(
    {
      ...mapped,
      generatedAt: new Date().toISOString(),
      // The packet names a class nobody judges by an empty name, not the "Judge unassigned" label.
      classes: mapped.classes.map(classItem => ({
        ...classItem,
        judgeName: resolveClassJudgeName(byId.get(classItem.id), assignedJudges, ''),
      })),
    },
    {
      trialId: input.trialId,
      // The stored name, as the cockpit header and the sheets' footers show it (MYK9-704,
      // MYK9-2110): never "Trial " + trial_number, which is free text and often "Trial 4".
      trialLabel: formatTrialLabel({ name: trial.name, trialNumber: trial.trial_number }),
      registryName: registry.name,
      parseStartMinutes: parseStoredClockTime,
      compareProgression: (a, b) => {
        const left = byId.get(a.id);
        const right = byId.get(b.id);
        return compareClassesByProgression(
          {
            element: left?.element ?? '',
            level: left?.level ?? '',
            section: left?.section ?? null,
          },
          {
            element: right?.element ?? '',
            level: right?.level ?? '',
            section: right?.section ?? null,
          },
          registry.id as Parameters<typeof compareClassesByProgression>[2]
        );
      },
      sheetsFor: classItem => {
        const row = byId.get(classItem.id);
        if (!row) return null;
        const pages = buildPages(
          input.trialId,
          row.id,
          [trial],
          [row] as DbClass[],
          input.entries as DbEntry[]
        );
        if (!pages[0]) return null;
        const dataSet: ReportDataSet = { show: input.show, pages };
        return { ...summarizeClassSheets(toScoresheetModel(dataSet, 'run-order')), dataSet };
      },
    }
  );
  return {
    trial,
    trialDate: trial.date,
    trialLabel: collated?.trialLabel ?? '',
    registryName: collated?.registryName ?? registry.name,
    judges: collated?.judges ?? [],
    emptyClassCount: collated?.emptyClassCount ?? 0,
    cancelledClassCount: trialClasses.length - live.length,
  };
}
