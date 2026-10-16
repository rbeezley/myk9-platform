import { describe, expect, it } from 'vitest';

import {
  COCKPIT_SPLIT_COLUMNS,
  COCKPIT_SPLIT_MIN_WIDTH,
  FOCUS_MIN_PX,
  SPLIT_GAP_PX,
  cockpitSplitColumns,
  isCockpitSplit,
} from '../cockpitSplit';

describe('the cockpit split geometry', () => {
  // Known answers: cockpit widths and the focus column Chromium laid out for them (2026-10-15,
  // Playwright at 1024 / 1280 / 1440, full page and beside the Shows list). If these drift, the
  // arithmetic no longer describes the grid and the threshold below means nothing.
  it.each([
    [884, 367],
    [968, 403],
    [1140, 476],
  ])('reproduces the browser: a %ipx cockpit gives the focused class %ipx', (width, focus) => {
    expect(Math.round(cockpitSplitColumns(width).focus)).toBe(focus);
  });

  it('accounts for every pixel: schedule + gap + focus is the cockpit width', () => {
    for (const width of [COCKPIT_SPLIT_MIN_WIDTH, 1000, 1352]) {
      const { schedule, focus } = cockpitSplitColumns(width);
      expect(schedule + SPLIT_GAP_PX + focus).toBeCloseTo(width, 6);
    }
  });

  it('splits from the first width whose share gives the focused class its minimum', () => {
    // At the threshold the fr share alone reaches the minimum; one pixel narrower it would only
    // get there by the minmax clamp, squeezing the schedule instead.
    const share = (width: number) => ((width - SPLIT_GAP_PX) * 0.85) / 2;
    expect(share(COCKPIT_SPLIT_MIN_WIDTH)).toBeGreaterThanOrEqual(FOCUS_MIN_PX);
    expect(share(COCKPIT_SPLIT_MIN_WIDTH - 1)).toBeLessThan(FOCUS_MIN_PX);
    expect(COCKPIT_SPLIT_MIN_WIDTH).toBe(868);

    expect(isCockpitSplit(COCKPIT_SPLIT_MIN_WIDTH)).toBe(true);
    expect(isCockpitSplit(COCKPIT_SPLIT_MIN_WIDTH - 1)).toBe(false);
    expect(cockpitSplitColumns(COCKPIT_SPLIT_MIN_WIDTH).focus).toBeGreaterThanOrEqual(FOCUS_MIN_PX);
  });

  it('stays stacked until the cockpit has been measured', () => {
    expect(isCockpitSplit(null)).toBe(false);
  });

  it('writes the same fractions and minimum into the grid template', () => {
    expect(COCKPIT_SPLIT_COLUMNS).toBe('minmax(0, 1.15fr) minmax(360px, 0.85fr)');
  });
});
