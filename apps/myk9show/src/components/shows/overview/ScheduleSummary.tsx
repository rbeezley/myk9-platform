import { ScheduleTimeline } from '@/components/schedule';

interface ScheduleSummaryProps {
  showId: string;
}

export function ScheduleSummary({ showId }: ScheduleSummaryProps) {
  return <ScheduleTimeline showId={showId} />;
}
