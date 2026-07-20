import { ScheduleTimeline } from '@/components/schedule';

interface ScheduleSummaryProps {
  showId: string;
  /**
   * Enables inline start-time editing on element cards. Only the RBAC-gated
   * manager Setup surface should pass true; defaults to read-only.
   */
  canEditSchedule?: boolean | undefined;
}

export function ScheduleSummary({ showId, canEditSchedule = false }: ScheduleSummaryProps) {
  return <ScheduleTimeline showId={showId} canEditSchedule={canEditSchedule} />;
}
