import type { ClassStatusDialogProps } from '../dialogSlots';
import type { ClassInfo } from '../types';

/**
 * The class the status dialog acts on, minus its id and entry count (the caller owns
 * those). The status is ringside's own eight-value one when the host supplies it
 * (`ringsideStatus`), else the host's stored status; the time inputs prefill from the
 * class's briefing time, "Break until" time and Expected start (MYK9-1513).
 */
export function statusDialogClassData(
  classInfo: ClassInfo
): Omit<ClassStatusDialogProps['classData'], 'id' | 'entry_count'> {
  return {
    element: classInfo.element,
    level: classInfo.level,
    class_name: classInfo.className,
    class_status: classInfo.ringsideStatus || classInfo.classStatus || 'no-status',
    ...(classInfo.briefingTime ? { briefing_time: classInfo.briefingTime } : {}),
    ...(classInfo.breakUntilTime ? { break_until_time: classInfo.breakUntilTime } : {}),
    ...(classInfo.expectedStartTime ? { start_time: classInfo.expectedStartTime } : {}),
  };
}
