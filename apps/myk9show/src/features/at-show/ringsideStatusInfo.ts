import type { ClassInfo } from '@myk9/ringside';
import { instantToClockTime } from '@/features/show-map/cockpit/cockpitTime';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';
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
