import { describe, expect, it } from 'vitest';
import {
  buildShowTodayBannerItems,
  formatClassTime,
  getShowTodayBannerVariant,
  type HydratedAccountTodayEntry,
} from './showTodayBanner.helpers';

describe('formatClassTime', () => {
  it('formats a raw 24h time', () => {
    expect(formatClassTime('08:00')).toBe('8:00 AM');
    expect(formatClassTime('13:30')).toBe('1:30 PM');
  });

  it('formats a 24h time with seconds', () => {
    expect(formatClassTime('08:00:00')).toBe('8:00 AM');
  });

  it('does NOT double-append the meridiem when the source already has one', () => {
    expect(formatClassTime('8:00 AM')).toBe('8:00 AM');
    expect(formatClassTime('08:00 AM')).toBe('8:00 AM');
    expect(formatClassTime('1:30 PM')).toBe('1:30 PM');
  });

  it('handles midnight and noon boundaries', () => {
    expect(formatClassTime('00:00')).toBe('12:00 AM');
    expect(formatClassTime('12:00')).toBe('12:00 PM');
  });

  it('returns a pending label for null/empty input', () => {
    expect(formatClassTime(null)).toBe('Time pending');
    expect(formatClassTime('')).toBe('Time pending');
    expect(formatClassTime('   ')).toBe('Time pending');
  });

  it('returns unparseable input as-is', () => {
    expect(formatClassTime('soon')).toBe('soon');
  });
});

const entry = (
  overrides: Partial<HydratedAccountTodayEntry>
): HydratedAccountTodayEntry => ({
  entryId: 'entry-1',
  showId: 'show-1',
  showName: 'Spring Trial',
  classId: 'class-1',
  trialId: 'trial-1',
  className: 'Container Novice',
  classStartTime: '09:00',
  ...overrides,
});

describe('showTodayBanner helpers', () => {
  it('hides the banner when the account has no today entries', () => {
    const items = buildShowTodayBannerItems([]);

    expect(items).toEqual([]);
    expect(getShowTodayBannerVariant(items)).toBe('hidden');
  });

  it('returns one CTA item for one show today', () => {
    const items = buildShowTodayBannerItems([
      entry({ entryId: 'entry-1' }),
      entry({ entryId: 'entry-2', classId: 'class-2', classStartTime: '10:30' }),
    ]);

    expect(getShowTodayBannerVariant(items)).toBe('single');
    expect(items).toEqual([
      {
        showId: 'show-1',
        showName: 'Spring Trial',
        earliestClassTime: '09:00',
        entryCount: 2,
        classCount: 2,
      },
    ]);
  });

  it('orders multiple shows by earliest class time', () => {
    const items = buildShowTodayBannerItems([
      entry({
        entryId: 'entry-late',
        showId: 'late-show',
        showName: 'Afternoon Trial',
        classStartTime: '13:00',
      }),
      entry({
        entryId: 'entry-early',
        showId: 'early-show',
        showName: 'Morning Trial',
        classStartTime: '08:15',
      }),
    ]);

    expect(getShowTodayBannerVariant(items)).toBe('stacked');
    expect(items.map(item => item.showId)).toEqual(['early-show', 'late-show']);
  });
});
