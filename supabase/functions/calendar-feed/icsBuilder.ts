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
 * That design assumed classes carry start times. In practice almost none do —
 * the day's start lives on the trial — so there is a second event shape: when a
 * trial's classes are untimed, ONE block covers the trial day. See
 * `CalendarTrialEvent` (MYK9-506).
 *
 * All times are emitted as UTC instants (`...Z`). Emitting local times would
 * require shipping VTIMEZONE blocks; converting to UTC is exact, far less code,
 * and every client renders it back in the viewer's own zone.
 */

export interface CalendarClassEvent {
  kind: 'class';
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

/**
 * The fallback event: one block for a whole trial day.
 *
 * Per-class times are the exception, not the rule — secretaries record the
 * day's start on the TRIAL (`trials.planned_start_time`) and leave
 * `classes.start_time` null. Without this shape the feed emitted nothing at
 * all for such a show, and the exhibitor's calendar came back empty (MYK9-506).
 */
export interface CalendarTrialEvent {
  kind: 'trial';
  /** Stable per-trial identity — distinct from any class UID. */
  trialId: string;
  trialName: string | null;
  showName: string | null;
  trialDate: string;
  /**
   * Wall-clock start in the trial's zone. Free text as the secretary typed it
   * (`trials.planned_start_time` is TEXT, usually "8:00 AM"), so it goes
   * through the same 12-and-24-hour parser as everything else.
   */
  plannedStartTime: string | null;
  /** Wall-clock end, same free-text shape; falls back to a default day length. */
  plannedEndTime: string | null;
  timeZone: string;
  venue: string | null;
  /** The exhibitor's own classes that day — what the block is actually for. */
  classNames: string[];
  /** Distinct armbands across those classes; named only when unambiguous. */
  armbands: number[];
}

export type CalendarEvent = CalendarClassEvent | CalendarTrialEvent;

const DEFAULT_DURATION_MINUTES = 60;
/**
 * A trial day with no published end is a whole-day commitment; 8am–5pm is the
 * shape of a normal trial. Deliberately generous — an exhibitor who blocks too
 * much of the day loses nothing, one who blocks too little double-books.
 */
const DEFAULT_TRIAL_DURATION_MINUTES = 540;
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
  const time = parseWallClockTime(timeHHMM);
  if (!dateMatch || !time) return null;

  const [, y, m, d] = dateMatch;
  const guess = Date.UTC(Number(y), Number(m) - 1, Number(d), time.hour, time.minute);
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

/**
 * Wall-clock text -> {hour, minute}, 24-hour and 12-hour both.
 *
 * Two columns feed this and they are typed differently. `classes.start_time`
 * is a Postgres TIME, so PostgREST hands over "08:30:00" — 24-hour, always.
 * `trials.planned_start_time` is TEXT the secretary typed, in practice
 * "8:00 AM". Reading only the leading H:MM parses "1:00 PM" as 01:00 and puts
 * an afternoon trial at one in the morning, so the meridiem is not optional to
 * honour once a 12-hour source exists (MYK9-506).
 *
 * Returns null rather than a guess: an unparsable time must drop its event,
 * never place it at a plausible-looking hour.
 */
export function parseWallClockTime(value: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?\s*$/i.exec(value.trim());
  if (!match) return null;

  const [, rawHour, rawMinute, meridiem] = match;
  let hour = Number(rawHour);
  const minute = Number(rawMinute);
  if (minute > 59) return null;

  if (meridiem) {
    // 12-hour: 12am is midnight, 12pm is noon — neither is 12 on the 24h clock
    // it maps to, so the hour must be normalised before the shift.
    if (hour < 1 || hour > 12) return null;
    if (hour === 12) hour = 0;
    if (meridiem.toLowerCase() === 'pm') hour += 12;
  } else if (hour > 23) {
    return null;
  }

  return { hour, minute };
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

function resolveTrialWindow(event: CalendarTrialEvent): { start: Date; end: Date } | null {
  if (!event.plannedStartTime) return null;
  const start = zonedWallTimeToUtc(event.trialDate, event.plannedStartTime, event.timeZone);
  if (!start || Number.isNaN(start.getTime())) return null;

  if (event.plannedEndTime) {
    const end = zonedWallTimeToUtc(event.trialDate, event.plannedEndTime, event.timeZone);
    if (end && !Number.isNaN(end.getTime()) && end > start) return { start, end };
  }
  return { start, end: new Date(start.getTime() + DEFAULT_TRIAL_DURATION_MINUTES * 60_000) };
}

function resolveClassWindow(event: CalendarClassEvent): { start: Date; end: Date } | null {
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
 * Whether this event will actually appear in the feed.
 *
 * Exported because `index.ts` has to decide, per trial, whether the per-class
 * events carry real times or the trial-level block must stand in for them.
 * Re-deriving that rule there is how the two halves come to disagree, so there
 * is exactly one answer to "is this timeable" and it lives here.
 */
export function hasResolvableTime(event: CalendarEvent): boolean {
  return (event.kind === 'class' ? resolveClassWindow(event) : resolveTrialWindow(event)) !== null;
}

/**
 * One VEVENT. Returns '' when the event has no resolvable time — nothing is
 * ever emitted at a guessed hour.
 */
export function buildVEvent(event: CalendarEvent, dtstamp: Date, origin: string): string {
  return event.kind === 'class'
    ? buildClassVEvent(event, dtstamp, origin)
    : buildTrialVEvent(event, dtstamp, origin);
}

function buildClassVEvent(event: CalendarClassEvent, dtstamp: Date, origin: string): string {
  const window = resolveClassWindow(event);
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

function buildTrialVEvent(event: CalendarTrialEvent, dtstamp: Date, origin: string): string {
  const window = resolveTrialWindow(event);
  if (!window) return '';

  const summary = [event.showName?.trim(), event.trialName?.trim()].filter(Boolean).join(' — ');

  const descriptionParts = [
    event.classNames.length > 0 ? `Your classes: ${event.classNames.join(', ')}` : null,
    // Several armbands would read as a list of numbers with nothing to attach
    // them to; one is the exhibitor's own identifier at ringside.
    event.armbands.length === 1 ? `Armband: ${event.armbands[0]}` : null,
    'Ring times are not posted yet. This covers the whole day — check the show page for your running order.',
  ].filter(Boolean) as string[];

  const lines = [
    'BEGIN:VEVENT',
    // Namespaced apart from class UIDs so a trial block and a class event can
    // never collide, and so the block disappears cleanly once real class times
    // arrive and the feed stops emitting it.
    `UID:trial-${event.trialId}@${origin}`,
    `DTSTAMP:${formatIcsUtc(dtstamp)}`,
    `DTSTART:${formatIcsUtc(window.start)}`,
    `DTEND:${formatIcsUtc(window.end)}`,
    `SUMMARY:${escapeIcsText(summary || 'Show day')}`,
    event.venue ? `LOCATION:${escapeIcsText(event.venue)}` : null,
    `DESCRIPTION:${escapeIcsText(descriptionParts.join('\n'))}`,
    // A whole-day placeholder is provisional by construction.
    'STATUS:TENTATIVE',
    'END:VEVENT',
  ].filter(Boolean) as string[];

  return lines.map(foldIcsLine).join('\r\n');
}

export interface CalendarDocumentOptions {
  calendarName: string;
  events: CalendarEvent[];
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

/**
 * Filename for the one-off download, derived from the show's own name.
 *
 * This has to be decided HERE, not by the client's `download` attribute: the
 * feed is served from a different origin than the app, and browsers ignore
 * `download` cross-origin. Content-Disposition is therefore the only thing
 * that actually names the saved file, and before this every show saved as the
 * same generic "myk9show-runs.ics".
 *
 * ASCII-only and quote-free by construction, so it is safe to interpolate
 * into the header without RFC 5987 encoding.
 */
export function buildIcsAttachmentFilename(showName: string | null | undefined): string {
  const slug = (showName ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return slug ? `${slug}-runs.ics` : 'myk9show-runs.ics';
}
