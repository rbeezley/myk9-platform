/**
 * icsBuilder — RFC 5545 output for exhibitor run schedules.
 *
 * Pure (no Deno APIs) so vitest covers it directly, same as L3's static-map.ts.
 *
 * DESIGN (docs/plan-google-apple-integrations.md L5): events are PER CLASS, not
 * per dog. A per-dog estimate would mean projecting from run order x average
 * run duration; that number moves every few minutes during a class, and every
 * move is a push notification from the subscriber's calendar client. Per-class
 * gives the "shifts as judging runs ahead or behind" behaviour the plan asks
 * for without turning the exhibitor's phone into a nag.
 *
 * All times are emitted as UTC instants (`...Z`). Emitting local times would
 * require shipping VTIMEZONE blocks; converting to UTC is exact, far less code,
 * and every client renders it back in the viewer's own zone.
 */

export interface CalendarClassEvent {
  /** Stable per-class identity — the UID must not change between fetches. */
  classId: string;
  className: string;
  /** Trial calendar date, YYYY-MM-DD, as typed by the secretary. */
  trialDate: string;
  /** Scheduled wall-clock start "HH:MM" in the trial's zone, if any. */
  startTime: string | null;
  /** Absolute start once the class actually began (overrides startTime). */
  actualStartTime: string | null;
  actualEndTime: string | null;
  /** Minutes; used to derive DTEND when the class has not finished. */
  estimatedDuration: number | null;
  /** IANA zone from trials.timezone — never a raw offset. */
  timeZone: string;
  venue: string | null;
  /** Armband is the exhibitor's own identifier at ringside. */
  armband: number | null;
  dogName: string | null;
  trialName: string | null;
}

const DEFAULT_DURATION_MINUTES = 60;
/** Calendar clients poll on their own schedule; this is a hint, not a promise. */
const REFRESH_INTERVAL = 'PT30M';

/**
 * Wall-clock time in an IANA zone -> UTC instant.
 *
 * Guess-and-correct: interpret the fields as if they were UTC, measure how far
 * that instant actually sits from the target zone, and shift by it. The second
 * pass matters at DST boundaries, where the offset at the guessed instant
 * differs from the offset at the corrected one.
 */
export function zonedWallTimeToUtc(
  dateISO: string,
  timeHHMM: string,
  timeZone: string
): Date | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateISO.trim());
  const timeMatch = /^(\d{1,2}):(\d{2})/.exec(timeHHMM.trim());
  if (!dateMatch || !timeMatch) return null;

  const [, y, m, d] = dateMatch;
  const [, hh, mm] = timeMatch;
  const guess = Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm));
  if (!Number.isFinite(guess)) return null;

  const firstOffset = zoneOffsetMs(new Date(guess), timeZone);
  if (firstOffset === null) return null;
  let instant = guess - firstOffset;

  const secondOffset = zoneOffsetMs(new Date(instant), timeZone);
  if (secondOffset !== null && secondOffset !== firstOffset) {
    instant = guess - secondOffset;
  }
  return new Date(instant);
}

/** Offset of `timeZone` from UTC at `date`, in ms. Null for an unusable zone. */
function zoneOffsetMs(date: Date, timeZone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(date);

    const field = (type: string) => Number(parts.find(p => p.type === type)?.value);
    const hour = field('hour');
    // Intl renders midnight as 24 in some ICU versions under hour12:false.
    const asUtc = Date.UTC(
      field('year'),
      field('month') - 1,
      field('day'),
      hour === 24 ? 0 : hour,
      field('minute'),
      field('second')
    );
    if (!Number.isFinite(asUtc)) return null;
    return asUtc - date.getTime();
  } catch {
    return null; // Invalid IANA zone — caller falls back.
  }
}

/** RFC 5545 date-time in UTC: 20260816T140000Z */
export function formatIcsUtc(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
}

/**
 * TEXT escaping per RFC 5545 §3.3.11. Backslash first, or it double-escapes
 * the escapes it just inserted.
 */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\n|\r/g, '\\n');
}

/**
 * Fold to <=75 octets per line (§3.1). Folding is by OCTET, not character, so
 * a multi-byte name (a dog called "Café") must not be split mid-sequence —
 * that yields mojibake in Apple Calendar rather than a clean error.
 */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const out: string[] = [];
  let current = '';
  let currentBytes = 0;
  // Continuation lines carry a leading space, so they get one octet less.
  let limit = 75;

  for (const char of line) {
    const charBytes = encoder.encode(char).length;
    if (currentBytes + charBytes > limit) {
      out.push(current);
      current = char;
      currentBytes = charBytes;
      limit = 74;
    } else {
      current += char;
      currentBytes += charBytes;
    }
  }
  if (current) out.push(current);
  return out.join('\r\n ');
}

function resolveWindow(event: CalendarClassEvent): { start: Date; end: Date } | null {
  const start = event.actualStartTime
    ? new Date(event.actualStartTime)
    : event.startTime
      ? zonedWallTimeToUtc(event.trialDate, event.startTime, event.timeZone)
      : null;
  if (!start || Number.isNaN(start.getTime())) return null;

  if (event.actualEndTime) {
    const end = new Date(event.actualEndTime);
    if (!Number.isNaN(end.getTime()) && end > start) return { start, end };
  }

  const minutes =
    event.estimatedDuration && event.estimatedDuration > 0
      ? event.estimatedDuration
      : DEFAULT_DURATION_MINUTES;
  return { start, end: new Date(start.getTime() + minutes * 60_000) };
}

function buildSummary(event: CalendarClassEvent): string {
  const dog = event.dogName?.trim();
  const armband = event.armband !== null ? `#${event.armband}` : null;
  const who = [dog, armband].filter(Boolean).join(' ');
  return who ? `${event.className} — ${who}` : event.className;
}

/**
 * One VEVENT. Returns '' when the class has no resolvable time — a class with
 * no schedule yet must be omitted, never emitted at a guessed hour.
 */
export function buildVEvent(event: CalendarClassEvent, dtstamp: Date, origin: string): string {
  const window = resolveWindow(event);
  if (!window) return '';

  const descriptionParts = [
    event.trialName ? `Trial: ${event.trialName}` : null,
    event.armband !== null ? `Armband: ${event.armband}` : null,
    event.actualStartTime ? 'Time confirmed from the ring.' : 'Estimated — may shift on the day.',
  ].filter(Boolean) as string[];

  const lines = [
    'BEGIN:VEVENT',
    // Stable UID: the same class must update in place, not duplicate, on refetch.
    `UID:class-${event.classId}@${origin}`,
    `DTSTAMP:${formatIcsUtc(dtstamp)}`,
    `DTSTART:${formatIcsUtc(window.start)}`,
    `DTEND:${formatIcsUtc(window.end)}`,
    `SUMMARY:${escapeIcsText(buildSummary(event))}`,
    event.venue ? `LOCATION:${escapeIcsText(event.venue)}` : null,
    `DESCRIPTION:${escapeIcsText(descriptionParts.join('\n'))}`,
    // Times move as the day runs; let clients know this entry is provisional.
    event.actualStartTime ? 'STATUS:CONFIRMED' : 'STATUS:TENTATIVE',
    'END:VEVENT',
  ].filter(Boolean) as string[];

  return lines.map(foldIcsLine).join('\r\n');
}

export interface CalendarDocumentOptions {
  calendarName: string;
  events: CalendarClassEvent[];
  dtstamp: Date;
  /** Host used to namespace UIDs; keep stable across deploys. */
  origin: string;
}

/** A complete VCALENDAR. CRLF throughout — RFC 5545 requires it. */
export function buildIcsDocument(options: CalendarDocumentOptions): string {
  const body = options.events
    .map(event => buildVEvent(event, options.dtstamp, options.origin))
    .filter(Boolean);

  const header = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//myK9Show//Run Schedule//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(options.calendarName)}`,
    `X-PUBLISHED-TTL:${REFRESH_INTERVAL}`,
    `REFRESH-INTERVAL;VALUE=DURATION:${REFRESH_INTERVAL}`,
  ].map(foldIcsLine);

  return [...header, ...body, 'END:VCALENDAR', ''].join('\r\n');
}
