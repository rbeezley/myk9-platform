import { describe, expect, it } from 'vitest';
import {
  compareClockTimes,
  formatClockTime,
  isClockTimeFailure,
  isUnresolvedClockTime,
  parseClockTime,
  parseStoredClockTime,
  storeClockTime,
} from './parseClockTime';

type Case = [input: string, expected: string];

/** "ok:<formatted>" or "error:<code>" so one table pins both outcomes. */
const outcome = (input: string): string => {
  const result = parseClockTime(input);
  return result.ok ? `ok:${result.formatted}` : `error:${result.error}`;
};

const CASES: Case[] = [
  // no AM/PM: placed in typical trial hours, 7 AM to 7 PM
  ['930', 'ok:9:30 AM'],
  ['130', 'ok:1:30 PM'],
  ['9:30', 'ok:9:30 AM'],
  ['9.30', 'ok:9:30 AM'],
  ['0930', 'ok:9:30 AM'],
  ['0130', 'ok:1:30 PM'],
  ['9', 'ok:9:00 AM'],
  ['09', 'ok:9:00 AM'],
  ['1', 'ok:1:00 PM'],
  ['12', 'ok:12:00 PM'],
  ['12:30', 'ok:12:30 PM'],
  ['6:00', 'ok:6:00 PM'],
  ['7:30', 'ok:7:30 AM'],
  ['11:45', 'ok:11:45 AM'],
  // 24-hour entry
  ['21:30', 'ok:9:30 PM'],
  ['2130', 'ok:9:30 PM'],
  ['13:05', 'ok:1:05 PM'],
  ['23:59', 'ok:11:59 PM'],
  ['0:30', 'ok:12:30 AM'],
  ['00:00', 'ok:12:00 AM'],
  // an explicit marker always wins
  ['9:30pm', 'ok:9:30 PM'],
  ['9:30 PM', 'ok:9:30 PM'],
  ['9:30a', 'ok:9:30 AM'],
  ['1p', 'ok:1:00 PM'],
  ['130a', 'ok:1:30 AM'],
  ['7:00 pm', 'ok:7:00 PM'],
  ['7a', 'ok:7:00 AM'],
  ['12a', 'ok:12:00 AM'],
  ['12:15 am', 'ok:12:15 AM'],
  ['12p', 'ok:12:00 PM'],
  ['9:30 p.m.', 'ok:9:30 PM'],
  ['930AM', 'ok:9:30 AM'],
  // pasted text, spaces, stray letters
  ['  9 : 30  ', 'ok:9:30 AM'],
  ['9 30 p', 'ok:9:30 PM'],
  ['at 9:30 sharp', 'ok:9:30 AM'],
  ['Start: 9:30 AM', 'ok:9:30 AM'],
  ['９：３０', 'ok:9:30 AM'],
  ['9h30', 'ok:9:30 AM'],
  // two readings fit the window: ask
  ['7', 'error:ambiguous'],
  ['7:00', 'error:ambiguous'],
  ['700', 'error:ambiguous'],
  // empty is never midnight
  ['', 'error:empty'],
  ['   ', 'error:empty'],
  // unreadable
  ['abc', 'error:invalid'],
  ['9:30 - 10:00', 'error:invalid'],
  ['9:30 am pm', 'error:invalid'],
  ['9/30', 'error:invalid'],
  ['9:30 10:00', 'error:invalid'],
  ['930:15', 'error:bad-hour'],
  ['9:3', 'error:incomplete'],
  ['12345', 'error:too-many-digits'],
  ['25', 'error:bad-hour'],
  ['9:75', 'error:bad-minute'],
  ['2475', 'error:bad-hour'],
  ['21:30pm', 'error:meridiem-conflict'],
  ['0 am', 'error:meridiem-conflict'],
  ['13p', 'error:meridiem-conflict'],
];

describe('parseClockTime known answers', () => {
  it.each(CASES)('%j reads as %s', (input, expected) => {
    expect(outcome(input)).toBe(expected);
  });

  it('gives minutes since midnight alongside the display text', () => {
    expect(parseClockTime('930')).toEqual({
      ok: true,
      minutesSinceMidnight: 570,
      formatted: '9:30 AM',
    });
    expect(parseClockTime('00:00')).toMatchObject({ ok: true, minutesSinceMidnight: 0 });
  });

  it('lists both readings of an ambiguous input so the UI can ask', () => {
    const result = parseClockTime('7:00');
    expect(isClockTimeFailure(result) && result.candidates).toEqual([
      { minutesSinceMidnight: 420, formatted: '7:00 AM' },
      { minutesSinceMidnight: 1140, formatted: '7:00 PM' },
    ]);
  });

  it('says why an input cannot be read', () => {
    const result = parseClockTime('9:75');
    expect(isClockTimeFailure(result) && result.reason).toMatch(/minutes/i);
  });
});

describe('unset versus midnight', () => {
  it('an empty field is unset, never 12:00 AM', () => {
    expect(parseClockTime('').ok).toBe(false);
    expect(isUnresolvedClockTime('')).toBe(false);
    expect(parseStoredClockTime('')).toBeNull();
    expect(parseStoredClockTime(null)).toBeNull();
    expect(parseStoredClockTime(undefined)).toBeNull();
  });

  it('midnight is a real time that is not unset', () => {
    expect(parseStoredClockTime('12:00 AM')).toBe(0);
    expect(parseStoredClockTime('00:00:00')).toBe(0);
    expect(compareClockTimes('12:00 AM', null)).toBeLessThan(0);
  });

  it('typed text that is not yet a time is unresolved', () => {
    expect(isUnresolvedClockTime('7')).toBe(true);
    expect(isUnresolvedClockTime('9:')).toBe(true);
    expect(isUnresolvedClockTime('09:30 AM')).toBe(false);
  });
});

describe('stored values', () => {
  it.each([
    ['9:00 AM', 540],
    ['09:00 AM', 540],
    ['12:30 pm', 750],
    ['1:05 PM', 785],
    ['13:30', 810],
    ['09:00:00', 540],
    ['9:30 a.m.', 570],
  ])('reads %j as %i minutes', (value, minutes) => {
    expect(parseStoredClockTime(value)).toBe(minutes);
  });

  it.each(['', 'soon', '25:00', '9:75', '13:00 PM', '0:30 AM', '2026-04-04T09:00:00Z'])(
    'does not read %j',
    value => {
      expect(parseStoredClockTime(value)).toBeNull();
    }
  );

  it('keeps each field storage format', () => {
    expect(storeClockTime(570, 'text')).toBe('09:30 AM');
    expect(storeClockTime(810, 'hhmm')).toBe('13:30');
    expect(storeClockTime(810, 'hhmmss')).toBe('13:30:00');
    expect(formatClockTime(0)).toBe('12:00 AM');
  });
});

describe('times sort as times', () => {
  it('orders 12-hour text chronologically, not alphabetically', () => {
    const times = ['1:00 PM', '9:00 AM', '12:30 PM', '10:15 AM', '8:00 AM'];
    expect([...times].sort(compareClockTimes)).toEqual([
      '8:00 AM',
      '9:00 AM',
      '10:15 AM',
      '12:30 PM',
      '1:00 PM',
    ]);
  });

  it('mixes 12- and 24-hour spellings on one axis and puts unset last', () => {
    expect(['14:00', null, '9:00 AM', 'soon', '1:30 PM'].sort(compareClockTimes)).toEqual([
      '9:00 AM',
      '1:30 PM',
      '14:00',
      null,
      'soon',
    ]);
  });
});
