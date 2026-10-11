/** Max-time entry parsing for the ringside Set Max Time dialog. */

/**
 * What a judge types → seconds. The iPhone numeric pad has no colon, so besides
 * "4:30" accept "4.30", "430" and a bare "4" (one or two digits are minutes).
 */
export function parseMaxTimeInput(raw: string): number | null {
  const text = raw.trim();
  const separated = /^(\d{1,2})[:.](\d{2})$/.exec(text);
  if (separated) return toSeconds(separated[1], separated[2]);
  if (/^\d{1,2}$/.test(text)) return Number(text) * 60;
  const packed = /^(\d{1,2})(\d{2})$/.exec(text);
  if (packed) return toSeconds(packed[1], packed[2]);
  return null;
}

/** Seconds past 59 are a typo, not a time: refuse rather than save a different one. */
function toSeconds(minutes: string, seconds: string): number | null {
  return Number(seconds) > 59 ? null : Number(minutes) * 60 + Number(seconds);
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
