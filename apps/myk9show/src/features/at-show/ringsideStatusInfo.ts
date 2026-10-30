import type { ClassInfo, ClassStatusValue } from '@myk9/ringside';
import { mergeSectionPhase, type PhaseSource } from '@myk9/ringside/run-queue';
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
 * The combined A/B header's phase label, from the SAME merged phase and time the combined
 * class card uses (`mergeSectionPhase`); this only formats it. Section A's label would hide B's
 * Offline Scoring, so the label is the merged phase's, or null when it has none (plain In Progress).
 */
function buildCombinedStatusLabel(
  a: ReplicatedClass,
  b: ReplicatedClass,
  timeZone: string
): string | null {
  const source = (cls: ReplicatedClass): PhaseSource => {
    const info = buildRingsideStatusInfo(cls, timeZone);
    return {
      class_status: info.ringsideStatus as ClassStatusValue,
      ...(info.briefingTime ? { briefing_time: info.briefingTime } : {}),
      ...(info.breakUntilTime ? { break_until: info.breakUntilTime } : {}),
      ...(cls.revisedExpectedStart ? { revised_expected_start: cls.revisedExpectedStart } : {}),
    };
  };
  const { status, time } = mergeSectionPhase(source(a), source(b));
  return formatRingsideStatusLabel(
    status,
    {
      briefing: time,
      breakUntil: time,
      startTime: time && status === 'start_time' ? instantToClockTime(time, timeZone) : undefined,
    },
    timeZone
  );
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
