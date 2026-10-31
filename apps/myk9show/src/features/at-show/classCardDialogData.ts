/**
 * Props for the class dialogs opened from a class-picker card (MYK9-1506).
 *
 * The dialogs themselves are the entry list's (`ClassDetailsPopover`,
 * `ClassOptionsDialog`, ...); these builders only shape a card's `ClassEntry`,
 * plus the live replicated class where the card lacks a fact, into the props
 * those components already take. Counts come from the card, so a dialog and the
 * card it was opened from can never disagree.
 */
import { isCombinedEntry } from '@myk9/ringside';
import type {
  ClassDetailsData,
  ClassEntry,
  ClassOptionsDialogProps,
  ClassRequirementsDialogProps,
  ClassStatusDialogProps,
  MaxTimeDialogProps,
} from '@myk9/ringside';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';
import { buildCombinedStatusLabel, buildRingsideStatusInfo } from './ringsideStatusInfo';

export function classDetailsData(
  entry: ClassEntry,
  live: ReplicatedClass | null,
  timeZone: string,
  countsTrusted: boolean,
  pairedLive: ReplicatedClass | null = null
): ClassDetailsData {
  // A combined A/B card shows the merged pair's status (the same merge the card uses),
  // never one section's own label, which would hide the other section's phase.
  const combined = isCombinedEntry(entry);
  const statusLabel = combined
    ? live && pairedLive
      ? (buildCombinedStatusLabel(live, pairedLive, timeZone) ?? undefined)
      : undefined
    : live
      ? buildRingsideStatusInfo(live, timeZone).statusLabel
      : undefined;
  const limit = (card: number | undefined, stored: number | null | undefined) =>
    card ?? stored ?? undefined;
  const visibility = (live?.visibilityPreset ?? entry.visibility_preset) as
    NonNullable<ClassDetailsData['visibilityPreset']> | undefined;
  const selfCheckin = live?.selfCheckinEnabled ?? entry.self_checkin_enabled;
  const areaCount = live?.areaCount ?? entry.area_count;
  return {
    classId: entry.id,
    status: entry.class_status,
    ...(statusLabel ? { statusLabel } : {}),
    // An unread or partial (exhibitor) replica must not pass its zeros off as the class's totals.
    ...(countsTrusted
      ? { totalEntries: entry.entry_count, completedEntries: entry.completed_count }
      : {}),
    judgeName: entry.judge_name,
    ...limitFields(entry, live, limit),
    ...(areaCount != null ? { areaCount } : {}),
    ...(visibility ? { visibilityPreset: visibility } : {}),
    ...(selfCheckin != null ? { selfCheckinEnabled: selfCheckin } : {}),
    ...(live?.hidesKnown != null ? { hidesKnown: live.hidesKnown } : {}),
    ...(live?.distractionCount != null ? { distractionCount: live.distractionCount } : {}),
  };
}

function limitFields(
  entry: ClassEntry,
  live: ReplicatedClass | null,
  pick: (card: number | undefined, stored: number | null | undefined) => number | undefined
): Partial<ClassDetailsData> {
  const t1 = pick(entry.time_limit_seconds, live?.timeLimitSeconds);
  const t2 = pick(entry.time_limit_area2_seconds, live?.timeLimitArea2Seconds);
  const t3 = pick(entry.time_limit_area3_seconds, live?.timeLimitArea3Seconds);
  return {
    ...(t1 != null ? { timeLimitSeconds: t1 } : {}),
    ...(t2 != null ? { timeLimitArea2Seconds: t2 } : {}),
    ...(t3 != null ? { timeLimitArea3Seconds: t3 } : {}),
  };
}

export function classOptionsData(
  entry: ClassEntry
): NonNullable<ClassOptionsDialogProps['classData']> {
  return {
    id: entry.id,
    element: entry.element,
    level: entry.level,
    class_name: entry.class_name,
    entry_count: entry.entry_count,
    completed_count: entry.completed_count,
    class_status: entry.class_status,
  };
}

export function classRequirementsData(
  entry: ClassEntry,
  registry: string | undefined
): ClassRequirementsDialogProps['classData'] {
  return {
    id: entry.id,
    element: entry.element,
    level: entry.level,
    class_name: entry.class_name,
    entry_count: entry.entry_count,
    ...(registry ? { registry } : {}),
  };
}

/** The picker's cards carry no time limits, so the saved ones come from the live replicated class. */
export function classMaxTimeData(
  entry: ClassEntry,
  live: ReplicatedClass | null
): MaxTimeDialogProps['classData'] {
  const t1 = live?.timeLimitSeconds ?? entry.time_limit_seconds;
  const t2 = live?.timeLimitArea2Seconds ?? entry.time_limit_area2_seconds;
  const t3 = live?.timeLimitArea3Seconds ?? entry.time_limit_area3_seconds;
  const areas = live?.areaCount ?? entry.area_count;
  return {
    id: entry.id,
    element: entry.element,
    level: entry.level,
    class_name: entry.class_name,
    ...(t1 != null ? { time_limit_seconds: t1 } : {}),
    ...(t2 != null ? { time_limit_area2_seconds: t2 } : {}),
    ...(t3 != null ? { time_limit_area3_seconds: t3 } : {}),
    ...(areas != null ? { area_count: areas } : {}),
  };
}

export function classStatusData(entry: ClassEntry): ClassStatusDialogProps['classData'] {
  return {
    id: entry.id,
    element: entry.element,
    level: entry.level,
    class_name: entry.class_name,
    class_status: entry.class_status,
    entry_count: entry.entry_count,
    ...(entry.briefing_time ? { briefing_time: entry.briefing_time } : {}),
    ...(entry.break_until ? { break_until_time: entry.break_until } : {}),
  };
}
