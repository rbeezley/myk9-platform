import { describe, expect, it } from 'vitest';
import { isInOfflinePromptWindow } from './offlinePromptWindow';

const NY = 'America/New_York';
const inWindow = (iso: string, timeZone: string | null | undefined = NY) =>
  isInOfflinePromptWindow({
    firstDay: '2026-11-20',
    lastDay: '2026-11-22',
    timeZone,
    now: new Date(iso),
  });

describe('isInOfflinePromptWindow', () => {
  it('opens at 00:00 three days before the first day in the show timezone', () => {
    // 2026-11-17 00:00 EST = 05:00Z
    expect(inWindow('2026-11-17T04:59:59Z')).toBe(false);
    expect(inWindow('2026-11-17T05:00:00Z')).toBe(true);
  });

  it('closes at the end of the last show day in the show timezone', () => {
    // 2026-11-22 23:59:59 EST = 2026-11-23T04:59:59Z
    expect(inWindow('2026-11-23T04:59:59Z')).toBe(true);
    expect(inWindow('2026-11-23T05:00:00Z')).toBe(false);
  });

  it('uses the show calendar when the UTC date differs', () => {
    // Pacific: 2026-11-17 00:00 PST = 08:00Z; UTC already reads Nov 17 at 01:00Z.
    expect(inWindow('2026-11-17T01:00:00Z', 'America/Los_Angeles')).toBe(false);
    expect(inWindow('2026-11-17T08:00:00Z', 'America/Los_Angeles')).toBe(true);
  });

  it('is a single-day window when there is no last day', () => {
    const base = { firstDay: '2026-11-20', timeZone: NY };
    expect(isInOfflinePromptWindow({ ...base, now: new Date('2026-11-21T12:00:00Z') })).toBe(false);
    expect(isInOfflinePromptWindow({ ...base, now: new Date('2026-11-20T12:00:00Z') })).toBe(true);
  });

  it('fails toward showing the prompt when dates or timezone are unknown', () => {
    const now = new Date('2026-01-01T12:00:00Z');
    expect(isInOfflinePromptWindow({ firstDay: '', timeZone: NY, now })).toBe(true);
    expect(isInOfflinePromptWindow({ firstDay: undefined, timeZone: NY, now })).toBe(true);
    expect(isInOfflinePromptWindow({ firstDay: '2026-11-20', timeZone: undefined, now })).toBe(
      true
    );
    expect(isInOfflinePromptWindow({ firstDay: '2026-11-20', timeZone: 'Not/AZone', now })).toBe(
      true
    );
  });
});
