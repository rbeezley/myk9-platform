import { describe, expect, it } from 'vitest';
import {
  formatDuration,
  isUnresolvedDuration,
  parseDuration,
  type DurationKind,
} from './parseDuration';

type Case = [input: string, expected: string];

/** "ok:<formatted>" or "error:<code>" so one table pins both outcomes. */
const outcome = (input: string, kind: DurationKind): string => {
  const result = parseDuration(input, kind);
  return result.ok ? `ok:${result.formatted}` : `error:${result.error}`;
};

const SEARCH: Case[] = [
  // digits fill from the right, like the paper sheet
  ['5', 'ok:0:00.05'],
  ['45', 'ok:0:00.45'],
  ['125', 'ok:0:01.25'],
  ['4532', 'ok:0:45.32'],
  ['12345', 'ok:1:23.45'],
  ['123456', 'ok:12:34.56'],
  ['000125', 'ok:0:01.25'],
  ['0004532', 'ok:0:45.32'],
  // pasted and separated forms
  ['1:23.45', 'ok:1:23.45'],
  ['1:23', 'ok:1:23.00'],
  ['01:23.45', 'ok:1:23.45'],
  ['0:45.3', 'ok:0:45.30'],
  ['1:23.450', 'ok:1:23.45'],
  ['83.45', 'ok:1:23.45'],
  ['45.5', 'ok:0:45.50'],
  ['45.', 'ok:0:45.00'],
  ['.5', 'ok:0:00.50'],
  ['83,45', 'ok:1:23.45'],
  ['1,23.45', 'error:bad-format'],
  // spaces and full-width characters
  [' 1 : 23 . 45 ', 'ok:1:23.45'],
  ['１２３４５', 'ok:1:23.45'],
  ['１：２３．４５', 'ok:1:23.45'],
  // zero is a time, empty is not
  ['0', 'ok:0:00.00'],
  ['000', 'ok:0:00.00'],
  ['0:00.00', 'ok:0:00.00'],
  ['', 'error:empty'],
  ['   ', 'error:empty'],
  // impossible values are flagged, never reinterpreted
  ['16545', 'error:seconds-over-59'],
  ['1:75.00', 'error:seconds-over-59'],
  ['1:5', 'error:incomplete'],
  ['1:', 'error:incomplete'],
  ['1:234', 'error:incomplete'],
  [':30', 'error:bad-format'],
  ['1:2:3', 'error:bad-format'],
  ['1.2.3', 'error:bad-format'],
  ['1:23.456', 'error:too-many-digits'],
  ['123:00', 'error:too-many-digits'],
  ['1234567', 'error:too-many-digits'],
  ['9999.99', 'error:too-large'],
  // letters and a minus sign
  ['abc', 'error:invalid-characters'],
  ['1:2O.45', 'error:invalid-characters'],
  ['45s', 'error:invalid-characters'],
  ['-45.3', 'error:invalid-characters'],
];

const MAX: Case[] = [
  // shorthand: 1-2 digits are minutes, 3-4 are m:ss
  ['4', 'ok:4:00'],
  ['04', 'ok:4:00'],
  ['15', 'ok:15:00'],
  ['430', 'ok:4:30'],
  ['0430', 'ok:4:30'],
  ['1000', 'ok:10:00'],
  ['1530', 'ok:15:30'],
  ['30', 'ok:30:00'],
  // separated and pasted
  ['4:30', 'ok:4:30'],
  ['04:30', 'ok:4:30'],
  ['4.30', 'ok:4:30'],
  ['4,30', 'ok:4:30'],
  ['4:30.00', 'ok:4:30'],
  ['１０：００', 'ok:10:00'],
  [' 4 : 30 ', 'ok:4:30'],
  // zero and empty
  ['0', 'ok:0:00'],
  ['', 'error:empty'],
  // flagged
  ['4:30.5', 'error:fraction-not-allowed'],
  ['495', 'error:seconds-over-59'],
  ['4:99', 'error:seconds-over-59'],
  ['4:3', 'error:incomplete'],
  ['43000', 'error:too-many-digits'],
  ['4.5', 'error:bad-format'],
  ['1.2.3', 'error:bad-format'],
  ['4m', 'error:invalid-characters'],
  ['-4', 'error:invalid-characters'],
];

describe('parseDuration known answers', () => {
  it.each(SEARCH)('search %j -> %s', (input, expected) => {
    expect(outcome(input, 'search')).toBe(expected);
  });

  it.each(MAX)('max %j -> %s', (input, expected) => {
    expect(outcome(input, 'max')).toBe(expected);
  });

  it('the two kinds read the same keystrokes differently, on purpose', () => {
    expect(outcome('430', 'search')).toBe('ok:0:04.30');
    expect(outcome('430', 'max')).toBe('ok:4:30');
    expect(outcome('4', 'search')).toBe('ok:0:00.04');
    expect(outcome('4', 'max')).toBe('ok:4:00');
  });

  it('never reads a typed 125 as 125 seconds', () => {
    const result = parseDuration('125', 'search');
    expect(result).toEqual({ ok: true, seconds: 1.25, formatted: '0:01.25' });
  });

  it('returns exact seconds', () => {
    expect(parseDuration('1:23.45', 'search')).toEqual({
      ok: true,
      seconds: 83.45,
      formatted: '1:23.45',
    });
    expect(parseDuration('4:30', 'max')).toEqual({ ok: true, seconds: 270, formatted: '4:30' });
  });

  it('says what seconds of 60 or more would mean and offers it', () => {
    const search = parseDuration('1:99.45', 'search');
    expect(search).toMatchObject({
      ok: false,
      error: 'seconds-over-59',
      suggestion: { seconds: 159.45, formatted: '2:39.45' },
    });
    const max = parseDuration('499', 'max');
    expect(max).toMatchObject({
      ok: false,
      error: 'seconds-over-59',
      suggestion: { seconds: 339, formatted: '5:39' },
    });
    expect(!max.ok && max.reason).toContain('99 seconds is 5:39');
  });

  it('names the stray characters and the digit limit in the reason', () => {
    const letters = parseDuration('45s', 'search');
    expect(!letters.ok && letters.reason).toContain('"s"');
    const long = parseDuration('1234567', 'search');
    expect(!long.ok && long.reason).toContain('6');
    expect(!long.ok && long.reason).toContain('7');
  });
});

describe('formatDuration', () => {
  it('uses m:ss.cc for scoring and m:ss for max', () => {
    expect(formatDuration(83.45, 'search')).toBe('1:23.45');
    expect(formatDuration(59.999, 'search')).toBe('1:00.00');
    expect(formatDuration(270, 'max')).toBe('4:30');
  });
});

describe('isUnresolvedDuration', () => {
  it('flags typed-but-unreadable text, not empty or a valid time', () => {
    expect(isUnresolvedDuration('', 'search')).toBe(false);
    expect(isUnresolvedDuration('1:23.45', 'search')).toBe(false);
    expect(isUnresolvedDuration('1:99', 'search')).toBe(true);
    expect(isUnresolvedDuration('abc', 'max')).toBe(true);
  });
});
