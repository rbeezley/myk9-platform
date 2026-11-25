import { formatTrialLabel } from '@myk9/core';
import { formatRingLabel } from '@/utils/ringLabel';
import { resolveClassJudgeName } from '@/utils/classJudgeDisplay';
import { resolveClassSection } from '@/services/entryDisplay/entryDisplaySelectors';
import {
  isEntryListedOnCheckIn,
  isOmittedFromCatalog,
  notRunningStatusLabel,
} from '@/lib/reports/runSheetEntries';
import type { ReportDbEntry, ReportScope } from '@/lib/reports/types';
import type { DbClass, DbTrial } from '@/types/database-mappings';
import type { Show } from '@/types/show-types';
import type { ShowJudgeAssignment } from '@/types/judge-types';
import type { EmergencyPacketInput } from '@/features/emergency-trial-packet/types';
import { mapScopedReportEntries, readTrialRegistryId } from './reportDataMapping';

type PacketData = Omit<EmergencyPacketInput, 'generatedAt'>;

/** The packet's trial list; needs no `Show` (MYK9-2103). */
export function buildPacketTrials(trials: readonly DbTrial[]): PacketData['trials'] {
  return trials.map(trial => ({
    id: trial.id,
    date: trial.date ?? '',
    name: formatTrialLabel({ name: trial.name, trialNumber: trial.trial_number }),
    trialNumber: String(trial.trial_number ?? ''),
    registryId: readTrialRegistryId(trial),
  }));
}

/**
 * The packet's class list. Split out of `buildEmergencyPacketData` (MYK9-2103) so a surface that
 * has no `Show` (the class card's print fingerprint) builds exactly the input the renderer gets.
 */
export function buildPacketClasses(
  classes: readonly DbClass[],
  assignedJudges: ReadonlyArray<ShowJudgeAssignment> = []
): PacketData['classes'] {
  return classes.map(classItem => {
    const raw = classItem as DbClass & Record<string, unknown>;
    const ringLabel = formatRingLabel(
      (raw.ring ?? raw.ring_number ?? raw.ringNumber) as string | number | null | undefined
    );
    return {
      id: classItem.id,
      trialId: classItem.trial_id ?? '',
      name:
        classItem.name ??
        [classItem.element, classItem.level, resolveClassSection(classItem.section)]
          .filter(Boolean)
          .join(' '),
      element: classItem.element ?? '',
      level: classItem.level ?? '',
      section: resolveClassSection(classItem.section),
      classNumber: classItem.class_number,
      displayOrder: classItem.display_order,
      judgeName: resolveClassJudgeName(classItem, assignedJudges),
      // No placeholder: `formatRingLabel` already returns null for absent or
      // meaningless values, and a ringless sport should print nothing at all.
      ringLabel: ringLabel,
      startTime: classItem.start_time,
      timeLimitSeconds: classItem.time_limit_seconds,
      timeLimitArea2Seconds: (raw.time_limit_area2_seconds as number | null) ?? null,
      timeLimitArea3Seconds: (raw.time_limit_area3_seconds as number | null) ?? null,
      numAreas: (raw.num_areas as number | null) ?? null,
      numHides: (raw.num_hides as number | null) ?? null,
      distractionCount: (raw.distraction_count as number | null) ?? null,
    };
  });
}

/**
 * The packet's entry list: the rows the renderer prints. MYK9-1162: never an entry still
 * awaiting a registration number. MYK9-2082: nor the source of a move-up or a declined entry.
 * MYK9-2387: every other entry is listed; one that will not run (Pending, Withdrawn, Pulled,
 * Absent) carries its status label, so the renderer prints it on the check-in sheet below the
 * runners and leaves it off the scoresheet. Its stored run order is kept for the catalog; the
 * sheets ignore it.
 */
export function buildPacketEntries(
  rows: readonly ReportDbEntry[],
  trials: readonly DbTrial[],
  classes: readonly DbClass[],
  assignedJudges: ReadonlyArray<ShowJudgeAssignment> = []
): PacketData['entries'] {
  const scope: ReportScope = { kind: 'show', showId: '' };
  return mapScopedReportEntries([...rows], [...trials], [...classes], scope, assignedJudges)
    .filter(entry => !entry.awaitingRegistrationNumber && isEntryListedOnCheckIn(entry))
    .map(entry => {
      const notRunningLabel = notRunningStatusLabel(entry);
      if (!notRunningLabel) return entry;
      return {
        ...entry,
        notRunningLabel,
        ...(isOmittedFromCatalog(entry) ? { omitFromCatalog: true } : {}),
      };
    });
}

export function buildEmergencyPacketData(input: {
  show: Show;
  trials: DbTrial[] | null | undefined;
  classes: DbClass[] | null | undefined;
  entries: ReportDbEntry[] | null | undefined;
}): PacketData {
  const trials = input.trials ?? [];
  const classes = input.classes ?? [];
  const entries = input.entries ?? [];
  const assignedJudges = input.show.assignedJudges ?? [];

  return {
    show: {
      id: input.show.id,
      name: input.show.name ?? '',
      clubName: input.show.clubName ?? undefined,
      organization: input.show.organization ?? undefined,
      startDate: input.show.startDate ?? '',
      endDate: input.show.endDate ?? input.show.startDate ?? '',
    },
    trials: buildPacketTrials(trials),
    classes: buildPacketClasses(classes, assignedJudges),
    entries: buildPacketEntries(entries, trials, classes, assignedJudges),
  };
}
