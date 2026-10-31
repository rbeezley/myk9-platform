/**
 * The one parser for a clock time, a time of day (MYK9-1504).
 *
 * Every place a person types a time of day (trial start, class start, briefing,
 * break-until, expected start, show open/close) reads it through `parseClockTime`,
 * and every stored clock text ("9:00 AM", "13:30", "09:00:00") is read through
 * `parseStoredClockTime`, so the same keystrokes mean the same thing everywhere,
 * nothing is saved that the live preview did not show, and times sort as times.
 * Durations are not clock times; see `parseDuration`.
 *
 * Rules, decided once:
 * - Full-width digits are folded, spaces are dropped, `9:30`, `9.30`, `930`, `0930`,
 *   `9`, `21:30`, `9:30pm`, `9 30 p` and `at 9:30 sharp` all read. Letters other than
 *   an `a`/`p`/`am`/`pm` marker are ignored only when a clean time remains.
 * - An explicit `a`/`p`/`am`/`pm` always wins. `12a` is 12:00 AM, `12p` is noon.
 * - Without one, an hour of 13 to 23 (or 0) is a 24-hour time. An hour of 1 to 12 is
 *   placed in typical trial hours, 7 AM to 7 PM: `930` is 9:30 AM, `130` is 1:30 PM.
 *   When both readings fit (only 7:00 itself) the result is `ambiguous` and lists both,
 *   so the UI asks instead of choosing.
 * - Empty is `{ ok:false, error:'empty' }`, never midnight. Midnight is `ok` with 0.
 */

export type ClockTimeErrorCode =
  | 'empty'
  | 'invalid'
  | 'incomplete'
  | 'too-many-digits'
  | 'bad-hour'
  | 'bad-minute'
  | 'meridiem-conflict'
  | 'ambiguous';

export interface ClockTimeCandidate {
  minutesSinceMidnight: number;
  formatted: string;
}

export interface ClockTimeSuccess {
  ok: true;
  minutesSinceMidnight: number;
  /** The one display format: "9:05 AM". */
  formatted: string;
}

export interface ClockTimeFailure {
  ok: false;
  error: ClockTimeErrorCode;
  /** A sentence for the person, safe to show under the field. */
  reason: string;
  /** The readings that fit, when the input fits more than one (`ambiguous`). */
  candidates?: ClockTimeCandidate[];
}

export type ClockTimeResult = ClockTimeSuccess | ClockTimeFailure;

/** Narrowing for packages compiled without strictNullChecks, where `.ok` does not. */
export function isClockTimeFailure(result: ClockTimeResult): result is ClockTimeFailure {
  return !result.ok;
}

/** Typical trial hours: an hour typed without AM/PM is placed in 7 AM to 7 PM. */
export const TRIAL_HOURS_START_MINUTES = 7 * 60;
export const TRIAL_HOURS_END_MINUTES = 19 * 60;

function twelveHour(minutesSinceMidnight: number, padHour: boolean): string {
  const hours = Math.floor(minutesSinceMidnight / 60);
  const hour12 = String(hours % 12 === 0 ? 12 : hours % 12);
  const minutes = String(minutesSinceMidnight % 60).padStart(2, '0');
  return `${padHour ? hour12.padStart(2, '0') : hour12}:${minutes} ${hours >= 12 ? 'PM' : 'AM'}`;
}

/** The one display format everywhere a time of day is shown: "9:05 AM". */
export function formatClockTime(minutesSinceMidnight: number): string {
  return twelveHour(minutesSinceMidnight, false);
}

/** 24-hour "HH:MM". */
export function formatClockTime24(minutesSinceMidnight: number): string {
  const hours = Math.floor(minutesSinceMidnight / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutesSinceMidnight % 60).padStart(2, '0')}`;
}

/** How a clock time is kept in its field's stored value (stored formats never change). */
export type ClockTimeStorage = 'text' | 'hhmm' | 'hhmmss';

/** The stored text for a time of day in `storage`. */
export function storeClockTime(minutesSinceMidnight: number, storage: ClockTimeStorage): string {
  // Trial start text has always been stored zero-padded, "09:05 AM"; that does not change.
  if (storage === 'text') return twelveHour(minutesSinceMidnight, true);
  const hhmm = formatClockTime24(minutesSinceMidnight);
  return storage === 'hhmm' ? hhmm : `${hhmm}:00`;
}

const success = (minutesSinceMidnight: number): ClockTimeSuccess => ({
  ok: true,
  minutesSinceMidnight,
  formatted: formatClockTime(minutesSinceMidnight),
});

const fail = (
  error: ClockTimeErrorCode,
  reason: string,
  candidates?: ClockTimeCandidate[]
): ClockTimeFailure =>
  candidates ? { ok: false, error, reason, candidates } : { ok: false, error, reason };

/** Minutes after midnight for a 12-hour clock reading with an explicit meridiem. */
function withMeridiem(hour12: number, minute: number, pm: boolean): number {
  return ((hour12 % 12) + (pm ? 12 : 0)) * 60 + minute;
}

const inTrialHours = (minutes: number) =>
  minutes >= TRIAL_HOURS_START_MINUTES && minutes <= TRIAL_HOURS_END_MINUTES;

function resolve(hour: number, minute: number, meridiem: 'a' | 'p' | null): ClockTimeResult {
  if (hour > 23) return fail('bad-hour', 'Hours go from 1 to 12, or 0 to 23 on a 24-hour clock.');
  if (minute > 59) return fail('bad-minute', 'Minutes go from 00 to 59.');
  if (meridiem) {
    if (hour < 1 || hour > 12) {
      return fail('meridiem-conflict', `${hour} cannot be AM or PM. Use 1 to 12 with AM or PM.`);
    }
    return success(withMeridiem(hour, minute, meridiem === 'p'));
  }
  if (hour === 0 || hour > 12) return success(hour * 60 + minute);
  const fits = [withMeridiem(hour, minute, false), withMeridiem(hour, minute, true)].filter(
    inTrialHours
  );
  const only = fits[0];
  if (fits.length === 1 && only !== undefined) return success(only);
  const candidates = fits.map(m => ({ minutesSinceMidnight: m, formatted: formatClockTime(m) }));
  // Only 7:00 fits twice (7 AM and 7 PM); every other hour 1 to 12 fits exactly one.
  return fail(
    'ambiguous',
    `Is that ${candidates[0]?.formatted} or ${candidates[1]?.formatted}?`,
    candidates
  );
}

/** A standalone a, p, am, pm, a.m. or p.m. marker; never a letter inside a word. */
const MERIDIEM = /(?<![a-z])([ap])\.?(?:m\.?)?(?![a-z])/g;

/** Parse what a person typed or pasted as a time of day. */
export function parseClockTime(input: string): ClockTimeResult {
  const folded = input.normalize('NFKC').toLowerCase();
  if (folded.trim() === '') return fail('empty', 'Enter a time.');

  const markers = [...folded.matchAll(MERIDIEM)].map(m => m[1] as 'a' | 'p');
  if (markers.length > 1) return fail('invalid', 'Use one AM or PM, like 9:30 AM.');
  const meridiem = markers[0] ?? null;

  const text = folded.replace(MERIDIEM, ' ').replace(/[a-z]/g, ' ');
  const groups = text.match(/\d+/g);
  if (!groups) return fail('invalid', 'Type a time like 9:30 AM.');
  // Anything besides digits, separators and spaces left over is not part of a time.
  if (/[^\d\s:.,]/.test(text)) return fail('invalid', 'Use numbers, like 9:30 AM.');

  const [first = '', second, ...rest] = groups;
  if (rest.length > 0) return fail('invalid', 'Type one time, like 9:30 AM.');

  if (second === undefined) {
    if (/[:.,]/.test(text)) return fail('incomplete', 'Type the minutes too, like 9:30.');
    if (first.length > 4) {
      return fail(
        'too-many-digits',
        `Too many digits: a time is up to 4 (hh mm), you typed ${first.length}.`
      );
    }
    if (first.length <= 2) return resolve(Number(first), 0, meridiem);
    return resolve(Number(first.slice(0, -2)), Number(first.slice(-2)), meridiem);
  }
  if (first.length > 2) return fail('bad-hour', 'Hours are one or two digits, like 9:30.');
  if (second.length !== 2) {
    return fail('incomplete', 'Minutes need two digits, like 9:05.');
  }
  return resolve(Number(first), Number(second), meridiem);
}

/**
 * A stored field value that holds something typed but not yet a valid time.
 * Callers refuse to save while this is true, so nothing is saved that the
 * preview did not show; an empty field is not unresolved, just unset.
 */
export function isUnresolvedClockTime(value: string): boolean {
  if (value.trim() === '') return false;
  return !parseClockTime(value).ok;
}

const STORED = /^\s*(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp])?\.?[Mm]?\.?\s*$/;

/**
 * Minutes after midnight for a STORED clock text ("9:00 AM", "09:00 AM", "13:30",
 * "09:00:00"), or null for anything else (an empty value, text, an ISO instant).
 * Strict by design: stored text is canonical, so there is no guessing AM from PM.
 * This is the one sort key for times of day.
 */
export function parseStoredClockTime(value: string | null | undefined): number | null {
  const match = STORED.exec(value ?? '');
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3]?.toLowerCase();
  if (minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    return withMeridiem(hour, minute, meridiem === 'p');
  }
  return hour > 23 ? null : hour * 60 + minute;
}

/** Compare two stored clock texts as times; an unset or unreadable one sorts last. */
export function compareClockTimes(a: string | null | undefined, b: string | null | undefined) {
  const ma = parseStoredClockTime(a);
  const mb = parseStoredClockTime(b);
  if (ma === mb) return 0;
  if (ma === null) return 1;
  if (mb === null) return -1;
  return ma - mb;
}
