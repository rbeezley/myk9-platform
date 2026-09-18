/**
 * MYK9-646 — the class dialogs must report the host's expected/accounted pair.
 *
 * The render-level proof lives in the shim
 * (`AtShowEntryListPage.badges.test.tsx`); these cases pin the two faults that
 * the rendered line cannot show on its own: the tab-filtered `completed_count`,
 * and the fallback a consumer supplying no pair still gets.
 */
import { describe, it, expect } from 'vitest';
import { classDialogCounts } from './classDialogCounts';

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: String(i) }));

describe('classDialogCounts', () => {
  it("uses the host's expected count, not every row the page holds", () => {
    // 66 rows, one of them withdrawn: the host's pair says 65 expected.
    expect(classDialogCounts({ totalEntries: 65, completedEntries: 0 }, rows(66), rows(0))).toEqual(
      { entry_count: 65, completed_count: 0 }
    );
  });

  it("uses the host's accounted count even when the Pending tab has filtered the completed rows away", () => {
    // `completedEntries` is derived from the tab-filtered list, so on Pending
    // it is empty however much of the class is scored. Trusting it reported
    // "0 completed" for a half-scored class.
    expect(classDialogCounts({ totalEntries: 65, completedEntries: 30 }, rows(66), [])).toEqual({
      entry_count: 65,
      completed_count: 30,
    });
  });

  it('honours a host pair that is zero rather than falling back to the raw lengths', () => {
    expect(classDialogCounts({ totalEntries: 0, completedEntries: 0 }, rows(66), rows(4))).toEqual({
      entry_count: 0,
      completed_count: 0,
    });
  });

  it('falls back to the raw lengths for a consumer that supplies no pair', () => {
    expect(classDialogCounts({}, rows(66), rows(4))).toEqual({
      entry_count: 66,
      completed_count: 4,
    });
    expect(classDialogCounts(null, rows(66), rows(4))).toEqual({
      entry_count: 66,
      completed_count: 4,
    });
  });

  it('falls back per half, so a host supplying only the denominator still gets it', () => {
    expect(classDialogCounts({ totalEntries: 65 }, rows(66), rows(4))).toEqual({
      entry_count: 65,
      completed_count: 4,
    });
  });
});
