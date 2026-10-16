import { describe, expect, it } from 'vitest';

import { COCKPIT_SPLIT_MIN_WIDTH, isCockpitSplit } from '@/features/show-map/cockpit/cockpitSplit';
import { ENTRY_COCKPIT_COMPACT_WIDTH } from '@/components/entries/management/entryManagementCockpitResponsive';
import {
  SHOWS_LIST_DEFAULT_PX,
  SHOWS_LIST_MAX_PX,
  SHOWS_LIST_MIN_PX,
  SHOWS_PANE_CHROME_PX,
  showWidthNeeded,
  showsListWidth,
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

// MYK9-1226: the panels save the list as a share of the split, not in pixels.
describe('the Shows list width the fold rule reads', () => {
  it('is the default with nothing saved', () => {
    expect(showsListWidth(1400, null)).toBe(SHOWS_LIST_DEFAULT_PX);
  });

  it('matches the browser: a saved 24.768% list in a 1304px split is 320px', () => {
    expect(showsListWidth(1304, 24.768)).toBeCloseTo(320, 0);
  });

  it('scales the saved share with the split, within the drag limits', () => {
    expect(showsListWidth(1412, 25)).toBe(350);
    expect(showsListWidth(2400, 25)).toBe(SHOWS_LIST_MAX_PX);
    expect(showsListWidth(800, 25)).toBe(SHOWS_LIST_MIN_PX);
  });

  it('folds on Entry Forms where a saved list wider than 320 would stack its cockpit', () => {
    // A split that just fits Entry Forms beside a 320px list: 320 + 33 + 1008.
    const split = SHOWS_LIST_DEFAULT_PX + SHOWS_PANE_CHROME_PX + showWidthNeeded('entries');
    expect(showsPaneFolds(split, 'entries')).toBe(false);

    // The same list saved as its share of a 1440 window's 1352px split, reopened at this one.
    const savedPercent = (SHOWS_LIST_DEFAULT_PX / (1352 - 12)) * 100;
    const listWidth = showsListWidth(split, savedPercent);
    expect(listWidth).toBeGreaterThan(SHOWS_LIST_DEFAULT_PX);
    expect(split - listWidth - SHOWS_PANE_CHROME_PX).toBeLessThan(showWidthNeeded('entries'));
    expect(showsPaneFolds(split, 'entries', listWidth)).toBe(true);
  });
});
