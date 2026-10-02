import { ScheduleTimeline } from '@/components/schedule';
import type { ClassEntryBreakdown } from '@/features/entry-operations/classEntryBreakdown';

interface ScheduleSummaryProps {
  showId: string;
  /**
   * Enables inline start-time editing on element cards. Only the RBAC-gated
   * manager Overview surface should pass true; defaults to read-only.
   */
  canEditSchedule?: boolean | undefined;
  compact?: boolean | undefined;
  entryBreakdownByClassId?: ReadonlyMap<string, ClassEntryBreakdown> | undefined;
}

export function ScheduleSummary({
  showId,
  canEditSchedule = false,
  compact = false,
  entryBreakdownByClassId,
}: ScheduleSummaryProps) {
  return (
    <ScheduleTimeline
      showId={showId}
      canEditSchedule={canEditSchedule}
      compact={compact}
      entryBreakdownByClassId={entryBreakdownByClassId}
    />
  );
}
