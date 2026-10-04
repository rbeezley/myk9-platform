import { formatClock } from '@/features/show-map/cockpit/cockpitClock';

/** Shown where a class has no start time of any kind. Never the current clock. */
export const NO_SCHEDULED_TIME = '—';

interface ScheduledClass {
  /** Already-formatted planned start ("7:30 AM"), or '' when none. */
  startTime?: string | undefined;
  /** Timestamptz of the revised expected start, when the class was re-timed. */
  revisedExpectedStart?: string | null | undefined;
}

/**
 * The class's scheduled time for the secretary page header: planned start,
 * then revised expected start, then an em dash (MYK9-984).
 */
export function secretaryClassScheduledLabel(
  cls: ScheduledClass | null | undefined,
  timeZone: string
): string {
  if (cls?.startTime) return cls.startTime;
  return formatClock(cls?.revisedExpectedStart, timeZone) ?? NO_SCHEDULED_TIME;
}
