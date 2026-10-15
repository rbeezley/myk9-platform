import { describe, expect, it } from 'vitest';

import { COCKPIT_SPLIT_MIN_WIDTH, isCockpitSplit } from '@/features/show-map/cockpit/cockpitSplit';
import { SHOWS_LIST_DEFAULT_PX, SHOWS_PANE_CHROME_PX, showsPaneFolds } from '../showsPaneFold';

// The cockpit's width beside a default-width list, from the split's width.
const cockpitBesideList = (splitWidth: number) =>
  splitWidth - SHOWS_LIST_DEFAULT_PX - SHOWS_PANE_CHROME_PX;

describe('when the Shows list folds away from an open show', () => {
  it('matches the browser: a 1144px split put the cockpit at 808px beside the list', () => {
    // Headless Chromium hides scrollbars; a classic one takes 17px more.
    expect(cockpitBesideList(1144) + 17).toBe(808);
  });

  it('keeps the list only where the cockpit beside it still splits', () => {
    const fold = SHOWS_LIST_DEFAULT_PX + SHOWS_PANE_CHROME_PX + COCKPIT_SPLIT_MIN_WIDTH;
    expect(showsPaneFolds(fold)).toBe(false);
    expect(isCockpitSplit(cockpitBesideList(fold))).toBe(true);
    expect(showsPaneFolds(fold - 1)).toBe(true);
    expect(isCockpitSplit(cockpitBesideList(fold - 1))).toBe(false);
  });

  it.each([
    // Split widths measured with the 88px rail: 1024, 1280 and 1440px windows.
    [888, true],
    [1144, true],
    // 1221px is the first split whose cockpit keeps 868px beside a list and a classic scrollbar.
    [1220, true],
    [1221, false],
    [1304, false],
  ])('a %ipx split folds: %s', (splitWidth, folds) => {
    expect(showsPaneFolds(splitWidth)).toBe(folds);
  });

  it('folds until measured, so the first frame is the show at full width', () => {
    expect(showsPaneFolds(null)).toBe(true);
  });
});
