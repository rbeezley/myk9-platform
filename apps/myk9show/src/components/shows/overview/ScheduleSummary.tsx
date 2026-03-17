import { ScheduleTimeline } from '@/components/schedule/ScheduleTimeline';

interface ScheduleSummaryProps {
  showId: string;
}

export function ScheduleSummary({ showId }: ScheduleSummaryProps) {
  return <ScheduleTimeline showId={showId} />;
}
