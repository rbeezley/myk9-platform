import type { TrialClass } from '@/components/trials/types/trial.types';
import type { SyncableClassData } from '@/store/class-store-types';

/**
 * The class as Trial Details lists it, and as Edit class receives it. A hand-built projection:
 * a field left out here never reaches the editor, whatever the read loaded. The entry limit and
 * wait list switch are carried so Edit class can show and keep them (MYK9-998); dropping them
 * hides both controls.
 */
export function toTrialDetailClass(classData: SyncableClassData, entries: number): TrialClass {
  const startTime =
    classData.startTime ||
    (classData.trialDate ? `${classData.trialDate}T09:00:00` : new Date().toISOString());
  return {
    id: classData.id,
    element: classData.element || 'Unknown',
    level: classData.level || 'Unknown',
    section: classData.section || 'A',
    status:
      classData.status === 'Scheduled'
        ? 'Upcoming'
        : (classData.status as 'Upcoming' | 'In Progress' | 'Completed' | 'Cancelled'),
    judgeId: ((classData as unknown as Record<string, unknown>).judgeId as string) || 'TBD',
    judgeName: classData.judge || 'TBD',
    startTime,
    entries,
    maxEntries: classData.maxEntries ?? null,
    allowsWaitlist: classData.allowsWaitlist,
  };
}
