import { describe, expect, it } from 'vitest';

import { COCKPIT_SPLIT_MIN_WIDTH, isCockpitSplit } from '@/features/show-map/cockpit/cockpitSplit';
import { ENTRY_COCKPIT_COMPACT_WIDTH } from '@/components/entries/management/entryManagementCockpitResponsive';
import {
  SHOWS_LIST_DEFAULT_PX,
  SHOWS_PANE_CHROME_PX,
  showWidthNeeded,
  showsPaneFolds,
} from '../showsPaneFold';

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
    expect(showsPaneFolds(null, 'entries')).toBe(true);
  });
});

describe('the Entry Forms tab folds the list where its cockpit beside it would stack (MYK9-1222)', () => {
  // The Entries cockpit's own width, beside a default list, from the split's width: the pane
  // chrome, then Entry Forms' 48px of side padding.
  const entriesCockpitBesideList = (splitWidth: number) =>
    splitWidth - SHOWS_LIST_DEFAULT_PX - SHOWS_PANE_CHROME_PX - 48;

  it('matches the browser: a 1304px split put the Entries cockpit at 920px beside the list', () => {
    // Headless Chromium hides scrollbars; a classic one takes 17px more.
    expect(entriesCockpitBesideList(1304) + 17).toBe(920);
  });

  it('keeps the list only where the Entries cockpit beside it stays at 960px or wider', () => {
    const fold = SHOWS_LIST_DEFAULT_PX + SHOWS_PANE_CHROME_PX + showWidthNeeded('entries');
    expect(fold).toBe(1361);
    expect(showsPaneFolds(fold, 'entries')).toBe(false);
    expect(entriesCockpitBesideList(fold)).toBeGreaterThanOrEqual(ENTRY_COCKPIT_COMPACT_WIDTH);
    expect(showsPaneFolds(fold - 1, 'entries')).toBe(true);
    expect(entriesCockpitBesideList(fold - 1)).toBeLessThan(ENTRY_COCKPIT_COMPACT_WIDTH);
  });

  it.each([
    // Split widths with the 88px rail: 1440, 1600 and 1920px windows.
    [1304, true],
    [1464, false],
    [1784, false],
  ])('a %ipx split folds on Entry Forms: %s', (splitWidth, folds) => {
    expect(showsPaneFolds(splitWidth, 'entries')).toBe(folds);
  });

  it('leaves the other tabs on Overview’s rule: at a 1440 window only Entry Forms folds', () => {
    expect(showsPaneFolds(1304, 'entries')).toBe(true);
    expect(showsPaneFolds(1304)).toBe(false);
    expect(showsPaneFolds(1304, 'results')).toBe(false);
    expect(showsPaneFolds(1304, 'reports')).toBe(false);
  });
});
