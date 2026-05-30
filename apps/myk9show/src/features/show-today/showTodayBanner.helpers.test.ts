import { describe, expect, it } from 'vitest';
import {
  buildShowTodayBannerItems,
  getShowTodayBannerVariant,
  type HydratedAccountTodayEntry,
} from './showTodayBanner.helpers';

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
