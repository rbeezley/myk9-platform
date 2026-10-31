/** Max-time helpers for the ringside Set Max Time dialog. */
import { formatDuration, parseDuration } from '@myk9/core';

/**
 * What a judge types → seconds, or null when it is not a readable max time. The
 * rules live in `parseDuration(…, 'max')` (@myk9/core): "4:30", "4.30" and "430"
 * are 270 s, a bare "4" is four minutes, seconds past 59 are refused.
 */
export function parseMaxTimeInput(raw: string): number | null {
  const parsed = parseDuration(raw, 'max');
  return parsed.ok ? parsed.seconds : null;
}

/** The class fields holding each area's max time, area 1 first (MYK9-1098). */
export const AREA_TIME_FIELDS = [
  'timeLimitSeconds',
  'timeLimitArea2Seconds',
  'timeLimitArea3Seconds',
] as const;

/** How many max-time inputs a class gets: its area count, 1..3. */
export function maxTimeAreaCount(areaCount: number | undefined): number {
  return Math.min(AREA_TIME_FIELDS.length, Math.max(1, areaCount ?? 1));
}

/** 150 → "2:30"; no time → "". */
export function toMinutesSeconds(seconds: number | undefined): string {
  if (!seconds || seconds <= 0) return '';
  return formatDuration(seconds, 'max');
}

const STEP_SECONDS = 30;

/** Every 30 s from the first step at or above `low` up to `high`. */
export function quickPickTimes(low: number, high: number): number[] {
  const times: number[] = [];
  for (let t = Math.ceil(low / STEP_SECONDS) * STEP_SECONDS; t <= high; t += STEP_SECONDS) {
    times.push(t);
  }
  return times;
}
