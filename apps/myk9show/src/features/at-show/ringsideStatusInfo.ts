import type { ClassInfo, ClassStatusValue } from '@myk9/ringside';
import { mergeSectionStatus, pickClassTime } from '@myk9/ringside/run-queue';
import { instantToClockTime } from '@/features/show-map/cockpit/cockpitTime';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';
import type { ReplicatedTrial } from '@/services/replication/ReplicatedTrialsTable';
import { getTrialTimezone } from '@/features/registries';
import { toRingsideClassStatus } from './ringsideClassStatusMap';
import { formatRingsideStatusLabel } from './ringsideStatusLabel';

/**
 * MYK9-1513: a class's status in ringside's eight-value vocabulary (status + ring
 * phase + Expected start) and the "HH:MM" times the status dialog prefills. The
 * stored `classStatus` stays on `ClassInfo` for the consumers that read it.
 */
export function buildRingsideStatusInfo(
  cls: ReplicatedClass,
  timeZone: string
): Pick<
  ClassInfo,
  'ringsideStatus' | 'statusLabel' | 'briefingTime' | 'breakUntilTime' | 'expectedStartTime'
> {
  const phaseTime = cls.ringPhaseTime?.slice(0, 5);
  const ringsideStatus = toRingsideClassStatus(cls);
  const expectedStartTime = cls.revisedExpectedStart
    ? instantToClockTime(cls.revisedExpectedStart, timeZone)
    : undefined;
  const briefingTime = cls.ringPhase === 'briefing' ? phaseTime : undefined;
  const breakUntilTime = cls.ringPhase === 'break' ? phaseTime : undefined;
  const statusLabel = formatRingsideStatusLabel(
    ringsideStatus,
    { briefing: briefingTime, breakUntil: breakUntilTime, startTime: expectedStartTime },
    timeZone
  );
  return {
    ringsideStatus,
    ...(statusLabel ? { statusLabel } : {}),
    ...(briefingTime ? { briefingTime } : {}),
    ...(breakUntilTime ? { breakUntilTime } : {}),
    ...(expectedStartTime ? { expectedStartTime } : {}),
  };
}

/**
 * The combined A/B header's phase label, from the SAME merged status the combined class
 * card uses (`mergeSectionStatus`). The label is taken whole from the section that supplies
 * that status, so its time is that section's own; no time is assembled across sections.
 * When both sections hold the merged status, Start Time goes to the earlier Expected start
 * INSTANT (`pickClassTime`, the card's rule) and Briefing / Break to section A, as on the card. When neither does (one completed, one
 * pre-scoring, which reads as In Progress), the merged status is worded with no time.
 */
function buildCombinedStatusLabel(
  a: ReplicatedClass,
  b: ReplicatedClass,
  timeZone: string
): string | null {
  const infoA = buildRingsideStatusInfo(a, timeZone);
  const infoB = buildRingsideStatusInfo(b, timeZone);
  const merged = mergeSectionStatus(
    infoA.ringsideStatus as ClassStatusValue,
    infoB.ringsideStatus as ClassStatusValue
  );
  const aHolds = infoA.ringsideStatus === merged;
  const bHolds = infoB.ringsideStatus === merged;
  if (!aHolds && !bHolds) return formatRingsideStatusLabel(merged, {}, timeZone);
  if (aHolds !== bHolds) return (aHolds ? infoA : infoB).statusLabel ?? null;
  // The card keeps section A's Briefing and Break time (`withMergedSectionState` only merges
  // the start instants), so only a Start Time tie goes to the earlier Expected start.
  const earlier =
    merged === 'start_time'
      ? pickClassTime(
          a.revisedExpectedStart ?? undefined,
          b.revisedExpectedStart ?? undefined,
          'earlier'
        )
      : undefined;
  const supplier = earlier !== undefined && earlier === b.revisedExpectedStart ? infoB : infoA;
  return supplier.statusLabel ?? null;
}

/**
 * Section A's class info with its own phase label replaced by the merged pair's (MYK9-1526).
 * Section A's label would hide B's Offline Scoring, so it is dropped even when the pair has none.
 */
export function withCombinedStatusLabel<T extends ClassInfo>(
  info: T | null,
  a: ReplicatedClass | null,
  b: ReplicatedClass | null,
  trial: ReplicatedTrial | null
): T | null {
  if (!info) return null;
  const next = { ...info };
  delete next.statusLabel;
  const label = a && b ? buildCombinedStatusLabel(a, b, getTrialTimezone(trial)) : null;
  return label ? { ...next, statusLabel: label } : next;
}
