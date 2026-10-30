import type { ClassInfo } from '@myk9/ringside';
import { instantToClockTime } from '@/features/show-map/cockpit/cockpitTime';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';
import { toRingsideClassStatus } from './ringsideClassStatusMap';

/**
 * MYK9-1513: a class's status in ringside's eight-value vocabulary (status + ring
 * phase + Expected start) and the "HH:MM" times the status dialog prefills. The
 * stored `classStatus` stays on `ClassInfo` for the consumers that read it.
 */
export function buildRingsideStatusInfo(
  cls: ReplicatedClass,
  timeZone: string
): Pick<ClassInfo, 'ringsideStatus' | 'briefingTime' | 'breakUntilTime' | 'expectedStartTime'> {
  const phaseTime = cls.ringPhaseTime?.slice(0, 5);
  return {
    ringsideStatus: toRingsideClassStatus(cls),
    ...(cls.ringPhase === 'briefing' && phaseTime ? { briefingTime: phaseTime } : {}),
    ...(cls.ringPhase === 'break' && phaseTime ? { breakUntilTime: phaseTime } : {}),
    ...(cls.revisedExpectedStart
      ? { expectedStartTime: instantToClockTime(cls.revisedExpectedStart, timeZone) }
      : {}),
  };
}
