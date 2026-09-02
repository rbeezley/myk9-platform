/**
 * Regression tests for impeccable p3 audit finding C2.
 *
 * `bulkActionEligibility` states that a bulk status change "must never" touch a
 * completed, scratched, moved, cancelled or move-up-requested entry, because
 * re-approving a scored entry corrupts closed results and the move-up queue.
 *
 * The multi-select toolbar honours that rule and labels its scope ("Accept 3 of
 * 5 selected"). The registration Actions menu uses the same eligibility helper.
 *
 * The rule now lives in one status-keyed helper that both paths share.
 */

import { describe, it, expect } from 'vitest';
import { EntryStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import {
  CLOSED_STATUSES,
  getEligibleForBulkAction,
  getEligibleForBulkStatusChange,
} from '../bulkActionEligibility';

function entry(id: string, entryStatus: EntryStatus): EntryManagementEntry {
  return { id, entryStatus, classes: [] } as unknown as EntryManagementEntry;
}

describe('getEligibleForBulkStatusChange (audit C2)', () => {
  it('excludes every closed status from a status change', () => {
    const target = EntryStatus.ACCEPTED;
    for (const closed of CLOSED_STATUSES) {
      expect(getEligibleForBulkStatusChange([entry('e', closed)], target)).toEqual([]);
    }
  });

  it('excludes entries already at the target status', () => {
    expect(
      getEligibleForBulkStatusChange([entry('e', EntryStatus.ACCEPTED)], EntryStatus.ACCEPTED)
    ).toEqual([]);
  });

  it('keeps entries that can validly move', () => {
    const eligible = getEligibleForBulkStatusChange(
      [entry('a', EntryStatus.PENDING), entry('b', EntryStatus.MISSING_INFO)],
      EntryStatus.ACCEPTED
    );
    expect(eligible.map(item => item.id)).toEqual(['a', 'b']);
  });

  it('agrees with the action-keyed helper, so the two paths cannot drift', () => {
    const entries = [
      entry('pending', EntryStatus.PENDING),
      entry('scored', EntryStatus.COMPLETED),
      entry('pulled', EntryStatus.SCRATCHED),
      entry('accepted', EntryStatus.ACCEPTED),
    ];
    expect(getEligibleForBulkStatusChange(entries, EntryStatus.ACCEPTED)).toEqual(
      getEligibleForBulkAction(entries, 'approve')
    );
    expect(getEligibleForBulkStatusChange(entries, EntryStatus.REJECTED)).toEqual(
      getEligibleForBulkAction(entries, 'reject')
    );
  });

  it('applies no status rule when there is no target status', () => {
    const entries = [entry('scored', EntryStatus.COMPLETED)];
    expect(getEligibleForBulkStatusChange(entries, null)).toEqual(entries);
  });
});
