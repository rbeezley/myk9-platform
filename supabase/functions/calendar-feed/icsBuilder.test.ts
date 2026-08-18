import { describe, expect, it } from 'vitest';
import {
  buildIcsDocument,
  buildVEvent,
  escapeIcsText,
  foldIcsLine,
  formatIcsUtc,
  zonedWallTimeToUtc,
  type CalendarClassEvent,
} from './icsBuilder';

const DTSTAMP = new Date('2026-08-16T12:00:00Z');
const ORIGIN = 'myk9show.com';

function event(overrides: Partial<CalendarClassEvent> = {}): CalendarClassEvent {
  return {
    classId: 'class-1',
    className: 'Excellent Interiors',
    trialDate: '2026-08-16',
    startTime: '08:30',
    actualStartTime: null,
    actualEndTime: null,
    estimatedDuration: 90,
    timeZone: 'America/New_York',
    venue: 'Purina Farms',
    armband: 314,
    dogName: 'Cooper',
    trialName: 'Trial I',
    ...overrides,
  };
}

describe('zonedWallTimeToUtc', () => {
  it('converts eastern daylight wall time to the right UTC instant', () => {
    // 2026-08-16 is EDT (UTC-4): 08:30 local = 12:30Z
    expect(zonedWallTimeToUtc('2026-08-16', '08:30', 'America/New_York')?.toISOString()).toBe(
      '2026-08-16T12:30:00.000Z'
    );
  });

  it('converts eastern STANDARD time correctly (UTC-5, not -4)', () => {
    // A January trial: same wall time, one hour further from UTC.
    expect(zonedWallTimeToUtc('2026-01-16', '08:30', 'America/New_York')?.toISOString()).toBe(
      '2026-01-16T13:30:00.000Z'
    );
  });

  it('handles a western zone, where a naive UTC read would be a whole day off', () => {
    expect(zonedWallTimeToUtc('2026-08-16', '20:00', 'America/Los_Angeles')?.toISOString()).toBe(
      '2026-08-17T03:00:00.000Z'
    );
  });

  it('handles a zone without DST', () => {
    expect(zonedWallTimeToUtc('2026-08-16', '08:00', 'America/Phoenix')?.toISOString()).toBe(
      '2026-08-16T15:00:00.000Z'
    );
  });

  it('resolves a wall time on the spring-forward morning', () => {
    // 2026-03-08 02:00 EST -> 03:00 EDT. 09:00 is safely after the jump: EDT.
    expect(zonedWallTimeToUtc('2026-03-08', '09:00', 'America/New_York')?.toISOString()).toBe(
      '2026-03-08T13:00:00.000Z'
    );
  });

  it('resolves a wall time on the fall-back morning', () => {
    // 2026-11-01: clocks fall back at 02:00. 09:00 is EST.
    expect(zonedWallTimeToUtc('2026-11-01', '09:00', 'America/New_York')?.toISOString()).toBe(
      '2026-11-01T14:00:00.000Z'
    );
  });

  it('returns null rather than a wrong time for malformed or unknown input', () => {
    expect(zonedWallTimeToUtc('not-a-date', '08:30', 'America/New_York')).toBeNull();
    expect(zonedWallTimeToUtc('2026-08-16', 'nope', 'America/New_York')).toBeNull();
    expect(zonedWallTimeToUtc('2026-08-16', '08:30', 'Mars/Olympus_Mons')).toBeNull();
  });

  it('accepts a seconds-bearing TIME as Postgres renders it', () => {
    expect(zonedWallTimeToUtc('2026-08-16', '08:30:00', 'America/New_York')?.toISOString()).toBe(
      '2026-08-16T12:30:00.000Z'
    );
  });
});

describe('formatIcsUtc', () => {
  it('emits a basic-format UTC stamp', () => {
    expect(formatIcsUtc(new Date('2026-08-16T14:05:09.123Z'))).toBe('20260816T140509Z');
  });
});

describe('escapeIcsText', () => {
  it('escapes backslash, semicolon, comma and newline', () => {
    expect(escapeIcsText('a\\b;c,d\ne')).toBe('a\\\\b\\;c\\,d\\ne');
  });

  it('escapes the backslash first so escapes are not double-escaped', () => {
    // ';' -> '\;' must not then become '\\;'
    expect(escapeIcsText(';')).toBe('\\;');
  });

  it('normalizes CRLF to a single escaped newline', () => {
    expect(escapeIcsText('a\r\nb')).toBe('a\\nb');
  });
});

describe('foldIcsLine', () => {
  it('leaves short lines alone', () => {
    expect(foldIcsLine('SUMMARY:short')).toBe('SUMMARY:short');
  });

  it('folds long lines with a CRLF + single leading space', () => {
    const folded = foldIcsLine(`SUMMARY:${'x'.repeat(200)}`);
    expect(folded).toContain('\r\n ');
    for (const line of folded.split('\r\n')) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  it('never splits a multi-byte character across a fold', () => {
    // Folding by character count instead of octets corrupts these.
    const folded = foldIcsLine(`SUMMARY:${'é'.repeat(80)}`);
    for (const line of folded.split('\r\n')) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    expect(folded.replace(/\r\n /g, '')).toBe(`SUMMARY:${'é'.repeat(80)}`);
  });
});

describe('buildVEvent', () => {
  it('uses the scheduled wall time when the class has not started', () => {
    const ics = buildVEvent(event(), DTSTAMP, ORIGIN);
    expect(ics).toContain('DTSTART:20260816T123000Z');
    expect(ics).toContain('DTEND:20260816T140000Z'); // +90 minutes
    expect(ics).toContain('STATUS:TENTATIVE');
    expect(ics).toContain('Estimated');
  });

  it('prefers the ACTUAL start once the ring reports it — this is the shift', () => {
    const ics = buildVEvent(
      event({ actualStartTime: '2026-08-16T13:12:00Z' }),
      DTSTAMP,
      ORIGIN
    );
    expect(ics).toContain('DTSTART:20260816T131200Z');
    expect(ics).toContain('STATUS:CONFIRMED');
    expect(ics).toContain('confirmed from the ring');
  });

  it('uses the actual end when the class has finished', () => {
    const ics = buildVEvent(
      event({ actualStartTime: '2026-08-16T13:00:00Z', actualEndTime: '2026-08-16T13:45:00Z' }),
      DTSTAMP,
      ORIGIN
    );
    expect(ics).toContain('DTEND:20260816T134500Z');
  });

  it('falls back to a default duration when none is recorded', () => {
    const ics = buildVEvent(event({ estimatedDuration: null }), DTSTAMP, ORIGIN);
    expect(ics).toContain('DTEND:20260816T133000Z'); // +60 minutes
  });

  it('ignores an end that precedes the start rather than emitting a negative event', () => {
    const ics = buildVEvent(
      event({ actualStartTime: '2026-08-16T13:00:00Z', actualEndTime: '2026-08-16T12:00:00Z' }),
      DTSTAMP,
      ORIGIN
    );
    // Falls back to the estimated duration from the ACTUAL start (13:00 + 90m).
    expect(ics).toContain('DTEND:20260816T143000Z');
  });

  it('OMITS a class with no time at all rather than guessing an hour', () => {
    expect(buildVEvent(event({ startTime: null }), DTSTAMP, ORIGIN)).toBe('');
  });

  it('keys the UID on the class so refetches update in place', () => {
    const ics = buildVEvent(event(), DTSTAMP, ORIGIN);
    expect(ics).toContain('UID:class-class-1@myk9show.com');
  });

  it('names the dog and armband in the summary', () => {
    expect(buildVEvent(event(), DTSTAMP, ORIGIN)).toContain(
      'SUMMARY:Excellent Interiors — Cooper #314'
    );
  });

  it('degrades to the class name when dog and armband are unknown', () => {
    const ics = buildVEvent(event({ dogName: null, armband: null }), DTSTAMP, ORIGIN);
    expect(ics).toContain('SUMMARY:Excellent Interiors');
  });

  it('escapes venue text that contains a comma', () => {
    const ics = buildVEvent(
      event({ venue: 'Purina Farms, Gray Summit, MO' }),
      DTSTAMP,
      ORIGIN
    );
    expect(ics).toContain('LOCATION:Purina Farms\\, Gray Summit\\, MO');
  });
});

describe('buildIcsDocument', () => {
  it('wraps events in a valid VCALENDAR with CRLF line endings', () => {
    const ics = buildIcsDocument({
      calendarName: 'My runs — Trial I',
      events: [event()],
      dtstamp: DTSTAMP,
      origin: ORIGIN,
    });

    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('METHOD:PUBLISH');
    expect(ics).toContain('X-WR-CALNAME:My runs — Trial I');
    expect(ics).not.toMatch(/[^\r]\n/); // every LF preceded by CR
  });

  it('advertises a refresh interval so subscribers re-poll during a show', () => {
    const ics = buildIcsDocument({
      calendarName: 'runs',
      events: [event()],
      dtstamp: DTSTAMP,
      origin: ORIGIN,
    });
    expect(ics).toContain('X-PUBLISHED-TTL:PT30M');
    expect(ics).toContain('REFRESH-INTERVAL;VALUE=DURATION:PT30M');
  });

  it('emits a valid empty calendar when nothing is scheduled yet', () => {
    const ics = buildIcsDocument({
      calendarName: 'runs',
      events: [],
      dtstamp: DTSTAMP,
      origin: ORIGIN,
    });
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).not.toContain('BEGIN:VEVENT');
  });

  it('drops untimed classes but keeps the timed ones', () => {
    const ics = buildIcsDocument({
      calendarName: 'runs',
      events: [event({ classId: 'a' }), event({ classId: 'b', startTime: null })],
      dtstamp: DTSTAMP,
      origin: ORIGIN,
    });
    expect(ics).toContain('UID:class-a@myk9show.com');
    expect(ics).not.toContain('UID:class-b@myk9show.com');
  });
});
