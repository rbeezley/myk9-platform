import { describe, expect, it } from 'vitest';

import {
  COCKPIT_SPLIT_COLUMNS,
  COCKPIT_SPLIT_MIN_WIDTH,
  FOCUS_MIN_PX,
  RAIL_PX,
  SPLIT_GAP_PX,
  clampRailWidth,
  cockpitSplitColumns,
  cockpitSplitTemplate,
  isCockpitSplit,
  railMaxWidth,
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

  it('narrows the schedule to a rail only while a class is focused', () => {
    expect(RAIL_PX).toBe(300);
    expect(cockpitSplitTemplate(true)).toBe('300px minmax(0, 1fr)');
    expect(cockpitSplitTemplate(false)).toBe(COCKPIT_SPLIT_COLUMNS);
  });

  // MYK9-2142: the secretary drags the rail wider; 300px is where it starts and its narrowest.
  it('writes a dragged rail width into the template, only while a class is focused', () => {
    expect(cockpitSplitTemplate(true, 420)).toBe('420px minmax(0, 1fr)');
    expect(cockpitSplitTemplate(false, 420)).toBe(COCKPIT_SPLIT_COLUMNS);
  });

  it('keeps the rail between 300px and what leaves the focused class its minimum', () => {
    expect(railMaxWidth(1200)).toBe(1200 - SPLIT_GAP_PX - FOCUS_MIN_PX);
    expect(clampRailWidth(100, 1200)).toBe(RAIL_PX);
    expect(clampRailWidth(451.6, 1200)).toBe(452);
    expect(clampRailWidth(2000, 1200)).toBe(820);
    // The narrowest split still has room above the minimum rail.
    expect(railMaxWidth(COCKPIT_SPLIT_MIN_WIDTH)).toBeGreaterThan(RAIL_PX);
    // Unmeasured or too narrow never goes below the minimum rail.
    expect(railMaxWidth(0)).toBe(RAIL_PX);
  });
});
