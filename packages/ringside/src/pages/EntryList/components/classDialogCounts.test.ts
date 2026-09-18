/**
 * MYK9-646 — the class dialogs must report the host's expected/accounted pair.
 *
 * The render-level proof lives in the shim
 * (`AtShowEntryListPage.badges.test.tsx`), which is where a regression to the
 * raw row count would actually show up. These cases pin the two things a
 * rendered line cannot show on its own: that `completed_count` carries the
 * host's ACCOUNTED number (not the tab-filtered array the call site used to
 * hand over), and that the function has no arithmetic of its own to drift.
 */
import { describe, it, expect } from 'vitest';
import { classDialogCounts } from './classDialogCounts';

describe('classDialogCounts', () => {
  it("renames the host's pair without touching either number", () => {
    // Interior Advanced: 66 rows, one withdrawn -> expected 65, accounted 0.
    expect(classDialogCounts({ totalEntries: 65, completedEntries: 0 })).toEqual({
      entry_count: 65,
      completed_count: 0,
    });
  });

  it('carries the accounted count, which the old call site could not', () => {
    // The call site passed the already TAB-FILTERED `completedEntries` array,
    // so on the Pending tab the slot received 0 however much was scored.
    expect(classDialogCounts({ totalEntries: 65, completedEntries: 30 })).toEqual({
      entry_count: 65,
      completed_count: 30,
    });
  });

  it('passes a zero pair straight through rather than treating it as absent', () => {
    // A `?? <raw length>` fallback would have swallowed this one silently.
    expect(classDialogCounts({ totalEntries: 0, completedEntries: 0 })).toEqual({
      entry_count: 0,
      completed_count: 0,
    });
  });
});
