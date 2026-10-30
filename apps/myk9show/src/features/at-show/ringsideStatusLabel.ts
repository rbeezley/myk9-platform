import type { EffectiveClassStatus } from '@myk9/ringside';
import { formatAtShowClassTime } from './atShowClassTiming';

/** The time each timed status carries, in whatever clock spelling the caller holds. */
export interface RingsideStatusTimes {
  briefing?: string | null | undefined;
  breakUntil?: string | null | undefined;
  startTime?: string | null | undefined;
}

/** The time a status carries: ["Briefing", t], ["Break Until", t], ["Start Time", t]. */
export function ringsideStatusTimeParts(
  status: EffectiveClassStatus,
  times: RingsideStatusTimes
): [string, string] | null {
  switch (status) {
    case 'briefing':
      return times.briefing ? ['Briefing', times.briefing] : null;
    case 'break':
      return times.breakUntil ? ['Break Until', times.breakUntil] : null;
    case 'start_time':
      return times.startTime ? ['Start Time', times.startTime] : null;
    default:
      return null;
  }
}

/**
 * The class card's status label as one string: "Briefing 10:00 AM", "Break Until
 * 10:30 AM", "Start Time 11:00 AM" or "Offline Scoring". Null for any other status
 * (plain In Progress keeps its ordinary badge). MYK9-1526: the entry-list header reads
 * this too, so the card and the header cannot disagree.
 */
export function formatRingsideStatusLabel(
  status: EffectiveClassStatus,
  times: RingsideStatusTimes,
  timeZone: string
): string | null {
  if (status === 'offline-scoring') return 'Offline Scoring';
  const parts = ringsideStatusTimeParts(status, times);
  return parts ? `${parts[0]} ${formatAtShowClassTime(parts[1], timeZone)}` : null;
}
