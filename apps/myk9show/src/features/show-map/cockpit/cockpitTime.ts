function partsFor(date: Date, timeZone: string): Record<string, number> {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, Number(part.value)])
  );
}

function offsetAt(date: Date, timeZone: string): number {
  const parts = partsFor(date, timeZone);
  return (
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) -
    date.getTime()
  );
}

export function clockTimeToInstant(date: string, clockTime: string, timeZone: string): string {
  const dateMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = clockTime.match(/^(\d{2}):(\d{2})$/);
  if (!dateMatch || !timeMatch) throw new Error('Expected a calendar date and 24-hour clock time');
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (hour > 23 || minute > 59) throw new Error('Expected a valid clock time');

  const wallTime = Date.UTC(year, month - 1, day, hour, minute);
  let instant = new Date(wallTime);
  instant = new Date(wallTime - offsetAt(instant, timeZone));
  instant = new Date(wallTime - offsetAt(instant, timeZone));
  return instant.toISOString();
}

export function instantToClockTime(value: string | null | undefined, timeZone: string): string {
  if (!value) return '';
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return '';
  const parts = partsFor(instant, timeZone);
  return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

/** A class's scheduled start ("9:30 AM" or "14:00") as a 24-hour "HH:MM", or ''. */
export function scheduledClockValue(value: string | null): string {
  const match = value?.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return '';
  let hour = Number(match[1]);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem) hour = (hour % 12) + (meridiem === 'PM' ? 12 : 0);
  return `${String(hour).padStart(2, '0')}:${match[2]}`;
}

/**
 * Whole minutes the revised expected start runs behind the scheduled start, or
 * `null` when the class is not running late (no revision, earlier, or no
 * scheduled time to compare against).
 */
export function getStartDelayMinutes({
  scheduledStart,
  revisedExpectedStart,
  trialDate,
  timeZone,
}: {
  scheduledStart: string | null;
  revisedExpectedStart: string | null;
  trialDate: string;
  timeZone: string;
}): number | null {
  const scheduledClock = scheduledClockValue(scheduledStart);
  if (!revisedExpectedStart || !scheduledClock) return null;
  let scheduledInstant: string;
  try {
    scheduledInstant = clockTimeToInstant(trialDate, scheduledClock, timeZone);
  } catch {
    return null;
  }
  const minutes = Math.round(
    (new Date(revisedExpectedStart).getTime() - new Date(scheduledInstant).getTime()) / 60_000
  );
  return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
}
