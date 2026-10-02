/** Parse "9:05 AM" / "09:05 pm" into 24-hour parts, or null when it is not a time. */
export function parseTimeOfDay(text: string): { hours: number; minutes: number } | null {
  const match = text.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?$/);
  if (!match) return null;
  let hours = parseInt(match[1] ?? '', 10);
  const minutes = parseInt(match[2] ?? '', 10);
  const period = match[3]?.toUpperCase();
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

/** True when the text is a real time of day; empty or unparseable text means "no time". */
export function hasTrialTime(text: string): boolean {
  return parseTimeOfDay(text) !== null;
}

/** Zero-padded 12-hour "09:05 AM" from 24-hour parts (no Date: a time of day is not an instant). */
export function formatTimeOfDay(hours: number, minutes: number): string {
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${String(hour12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${period}`;
}

/**
 * One spelling for a time of day: zero-padded 12-hour, "09:05 AM" — the form Edit
 * Trial has always stored and validated. Unparseable text comes back trimmed.
 */
export function normalizeTimeOfDay(text: string): string {
  const parts = parseTimeOfDay(text);
  if (!parts) return text.trim();
  return formatTimeOfDay(parts.hours, parts.minutes);
}
