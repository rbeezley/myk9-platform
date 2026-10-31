/**
 * The one parser for a typed duration (MYK9-1503).
 *
 * Every place a person types a time (scoresheet manual time, paper scoring,
 * the results grid, Set Max Time) reads it through `parseDuration`, so the
 * same keystrokes mean the same thing everywhere and nothing is saved that the
 * live preview did not show. Clock times (times of day) are not durations.
 *
 * Two kinds differ on purpose (owner decision):
 * - `search`: a scoring time, m:ss.cc (hundredths). Bare digits FILL FROM THE
 *   RIGHT like the paper sheet: the last two are hundredths, the two before are
 *   seconds, the rest minutes. `45` is 0:00.45 and `125` is 0:01.25, never 125 s.
 * - `max`: a class time limit, m:ss (whole seconds). A bare 1 or 2 digits are
 *   minutes, 3 or 4 digits are m:ss. `4` is 4:00 and `430` is 4:30.
 *
 * Rules, decided once:
 * - Full-width digits and separators are folded to ASCII, spaces are dropped,
 *   leading zeros are harmless, `,` reads as `.`.
 * - Anything but digits and `: . ,` (letters, a minus sign) is an error. Never
 *   dropped, because dropping it can turn "1:2O.45" into a different time.
 * - A colon form needs two-digit seconds, and seconds of 60 or more are an
 *   error that SAYS what they would mean ("99 seconds is 1:39") and carries it
 *   as `suggestion`, so the UI can ask instead of choosing for the person.
 * - A dotted number with no colon is decimal seconds and may exceed 59:
 *   `83.45` is 1:23.45 (the stopwatch's way of reading a long time). The max
 *   kind reads a dotted `4.30` as 4:30 instead (the numeric pad has no colon).
 * - More digits than fit is an error that says how many fit, never a silent cut.
 * - Empty is `{ ok:false, error:'empty' }`, never zero. Zero is `ok` with 0.
 */

export type DurationKind = 'search' | 'max';

export type DurationErrorCode =
  | 'empty'
  | 'invalid-characters'
  | 'incomplete'
  | 'bad-format'
  | 'too-many-digits'
  | 'seconds-over-59'
  | 'fraction-not-allowed'
  | 'too-large';

export interface DurationSuggestion {
  seconds: number;
  formatted: string;
}

export interface DurationSuccess {
  ok: true;
  seconds: number;
  formatted: string;
}

export interface DurationFailure {
  ok: false;
  error: DurationErrorCode;
  /** A sentence for the person, safe to show under the field. */
  reason: string;
  /** What an out-of-range seconds field would mean, when it has one. */
  suggestion?: DurationSuggestion;
}

export type DurationResult = DurationSuccess | DurationFailure;

/** Narrowing for packages compiled without strictNullChecks, where `.ok` does not. */
export function isDurationFailure(result: DurationResult): result is DurationFailure {
  return !result.ok;
}

/** Most digits a bare scoring time holds: mm ss cc. */
export const SEARCH_MAX_DIGITS = 6;
/** Most digits a bare max time holds: m ss (or mm ss). */
export const MAX_TIME_MAX_DIGITS = 4;
const MAX_MINUTES = 99;

/** Whole centiseconds as "m:ss.cc". */
function joinSearch(centis: number): string {
  const minutes = Math.floor(centis / 6000);
  const seconds = Math.floor((centis % 6000) / 100);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(centis % 100).padStart(2, '0')}`;
}

/** Whole seconds as "m:ss". */
function joinMax(totalSeconds: number): string {
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

/** The one display format for a duration of `kind`. */
export function formatDuration(seconds: number, kind: DurationKind): string {
  return kind === 'search' ? joinSearch(Math.round(seconds * 100)) : joinMax(Math.round(seconds));
}

const fail = (
  error: DurationErrorCode,
  reason: string,
  suggestion?: DurationSuggestion
): DurationResult =>
  suggestion ? { ok: false, error, reason, suggestion } : { ok: false, error, reason };

function succeed(centis: number, kind: DurationKind): DurationResult {
  return kind === 'search'
    ? { ok: true, seconds: centis / 100, formatted: joinSearch(centis) }
    : { ok: true, seconds: centis / 100, formatted: joinMax(centis / 100) };
}

/** Build a result from minutes/seconds/centis, rejecting seconds of 60 or more. */
function fromParts(
  minutes: number,
  seconds: number,
  centis: number,
  kind: DurationKind
): DurationResult {
  if (seconds >= 60) {
    const total = (minutes * 60 + seconds) * 100 + centis;
    const meant = kind === 'search' ? joinSearch(total) : joinMax(total / 100);
    if (total > (MAX_MINUTES * 60 + 59) * 100 + 99) {
      return fail('too-large', `${MAX_MINUTES} minutes is the most a time can hold.`);
    }
    return fail('seconds-over-59', `${seconds} seconds is ${meant}. Use ${meant}?`, {
      seconds: total / 100,
      formatted: meant,
    });
  }
  return succeed((minutes * 60 + seconds) * 100 + centis, kind);
}

/** Fold width variants and strip spaces: "１：２３．４５" -> "1:23.45". */
function normalize(input: string): string {
  return input.normalize('NFKC').replace(/\s+/g, '').replace(/,/g, '.');
}

function parseBareDigits(digits: string, kind: DurationKind): DurationResult {
  if (kind === 'search') {
    const significant = digits.replace(/^0+/, '');
    if (significant.length > SEARCH_MAX_DIGITS) {
      return fail(
        'too-many-digits',
        `Too many digits: a time holds up to ${SEARCH_MAX_DIGITS} (mm ss hh) and you typed ${significant.length}.`
      );
    }
    const padded = significant.padStart(4, '0');
    return fromParts(
      Number(padded.slice(0, -4) || 0),
      Number(padded.slice(-4, -2)),
      Number(padded.slice(-2)),
      kind
    );
  }
  if (digits.length > MAX_TIME_MAX_DIGITS) {
    return fail(
      'too-many-digits',
      `Too many digits: a max time holds up to ${MAX_TIME_MAX_DIGITS} (m ss) and you typed ${digits.length}.`
    );
  }
  if (digits.length <= 2) return fromParts(Number(digits), 0, 0, kind);
  return fromParts(Number(digits.slice(0, -2)), Number(digits.slice(-2)), 0, kind);
}

/** The fraction after a dot as centiseconds; null when it has digits that would be cut. */
function fractionToCentis(fraction: string): number | null {
  if (fraction.length <= 2) return Number(fraction.padEnd(2, '0'));
  return /^0+$/.test(fraction.slice(2)) ? Number(fraction.slice(0, 2)) : null;
}

const TOO_PRECISE = 'Times go to hundredths of a second (two digits after the point).';

function parseColon(text: string, kind: DurationKind): DurationResult {
  const match = /^(\d+):(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match) {
    return fail('bad-format', 'Use minutes:seconds, like 1:23.45.');
  }
  const [, minutesText = '', secondsText = '', fraction] = match;
  if (minutesText.replace(/^0+/, '').length > 2) {
    return fail('too-many-digits', `Minutes can have two digits at most (up to ${MAX_MINUTES}).`);
  }
  if (secondsText.length !== 2) {
    return fail(
      'incomplete',
      secondsText.length > 2
        ? 'Seconds are two digits, like 1:05.'
        : 'Seconds need two digits, like 1:05.'
    );
  }
  let centis = 0;
  if (fraction !== undefined && fraction !== '') {
    const parsed = fractionToCentis(fraction);
    if (kind === 'max') {
      if (parsed !== 0) {
        return fail('fraction-not-allowed', 'A max time is whole seconds, like 4:30.');
      }
    } else if (parsed === null) {
      return fail('too-many-digits', TOO_PRECISE);
    } else {
      centis = parsed;
    }
  }
  return fromParts(Number(minutesText), Number(secondsText), centis, kind);
}

function parseDotted(text: string, kind: DurationKind): DurationResult {
  const match = /^(\d*)\.(\d*)$/.exec(text);
  if (!match) return fail('bad-format', 'Use one decimal point, like 83.45.');
  const [, whole = '', fraction = ''] = match;
  if (whole === '' && fraction === '') return fail('incomplete', 'Type some digits.');
  if (kind === 'max') {
    // The numeric pad has no colon, so "4.30" has always meant 4:30.
    if (/^\d{1,2}$/.test(whole) && /^\d{2}$/.test(fraction)) {
      return fromParts(Number(whole), Number(fraction), 0, kind);
    }
    return fail('bad-format', 'Use minutes:seconds, like 4:30.');
  }
  const centis = fractionToCentis(fraction);
  if (centis === null) return fail('too-many-digits', TOO_PRECISE);
  const total = Number(whole || 0) * 100 + centis;
  if (total > (MAX_MINUTES * 60 + 59) * 100 + 99) {
    return fail('too-large', `${MAX_MINUTES} minutes is the most a time can hold.`);
  }
  return succeed(total, kind);
}

/** Parse what a person typed or pasted as a duration of `kind`. */
export function parseDuration(input: string, kind: DurationKind): DurationResult {
  const text = normalize(input);
  if (text === '') return fail('empty', 'Enter a time.');
  const stray = text.match(/[^\d:.]/g);
  if (stray) {
    return fail(
      'invalid-characters',
      `Use numbers only. "${[...new Set(stray)].join('')}" is not part of a time.`
    );
  }
  if (/^\d+$/.test(text)) return parseBareDigits(text, kind);
  if (text.includes(':')) return parseColon(text, kind);
  return parseDotted(text, kind);
}

/**
 * A stored field value that holds something typed but not yet a valid time.
 * Callers refuse to save while this is true, so nothing is saved that the
 * preview did not show; an empty field is not unresolved, just empty.
 */
export function isUnresolvedDuration(value: string, kind: DurationKind): boolean {
  if (value.trim() === '') return false;
  return !parseDuration(value, kind).ok;
}
