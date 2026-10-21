import { formatShowDateRange } from '@/lib/format/dates';
import type { Show } from '@/types/show-types';

/** "Aug 1–3, 2030 · Des Moines, IA": what tells same-named shows apart. */
export function ShowDateVenueLine({
  show,
}: {
  show: Pick<Show, 'startDate' | 'endDate' | 'location'>;
}) {
  const parts = [formatShowDateRange(show.startDate, show.endDate)];
  if (show.location) parts.push(show.location);
  return <p className="text-xs text-muted-foreground mt-0.5">{parts.join(' · ')}</p>;
}
