import { formatStartTime } from '@/components/schedule/schedule-timeline.utils';
import type { PeopleRosterClassRow } from './peopleRoster';

/**
 * One class on the Check-in desk in words (MYK9-1689): `day · class · ring · time`, each part
 * left out when it is empty (the day only shows on another day's class). The per-class line on a
 * dog's card and the exhibitor's "First class" line (MYK9-1786) both read it.
 */
export function deskClassLine(
  row: Pick<PeopleRosterClassRow, 'dayLabel' | 'className' | 'ring' | 'time'>
): string {
  const time = formatStartTime(row.time);
  return [row.dayLabel, row.className, row.ring, time].filter(Boolean).join(' · ');
}
