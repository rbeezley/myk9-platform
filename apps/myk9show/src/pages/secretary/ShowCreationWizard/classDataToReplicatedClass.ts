import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';
import type { SportClassRuleRow } from '@/types/sport-template-types';
import type { ClassData } from '@/components/classes/types/classTypes';

/** Convert wizard ClassData to ReplicatedClass for offline-first storage. */
export function classDataToReplicatedClass(
  classData: ClassData,
  rule?: SportClassRuleRow
): ReplicatedClass {
  return {
    id: classData.id || crypto.randomUUID(),
    trialId: classData.trialId,
    name: classData.className || classData.trial || 'Class',
    level: classData.level,
    element: classData.element,
    section: classData.section,
    entryFee: classData.preEntryFee || classData.entryFee,
    maxEntries: classData.maxEntries,
    judgeName: classData.judge,
    classOrder: classData.classOrder ? parseInt(classData.classOrder, 10) : undefined,
    classStatus: classData.status || 'Scheduled',
    startTime: classData.startTime,
    // Keep snake_case alias for backward compatibility.
    trial_id: classData.trialId,
    ...(rule && {
      timerMode: rule.timer_mode,
      hidesKnown: rule.hides_known,
      distractionCount: rule.distraction_count_min,
      areaCount: rule.area_count,
      timeLimitSeconds: rule.max_time_seconds_fixed ?? undefined,
    }),
  };
}
