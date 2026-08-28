/**
 * Regression tests for impeccable p3 audit finding C2.
 *
 * `bulkActionEligibility` states that a bulk status change "must never" touch a
 * completed, scratched, moved, cancelled or move-up-requested entry, because
 * re-approving a scored entry corrupts closed results and the move-up queue.
 *
 * The multi-select toolbar honoured that rule and even labelled its scope
 * ("Accept 3 of 5 selected"). The registration Actions menu did not: it passed
 * `group.entries.map(e => e.id)` straight through, and the shared handler
 * filtered only by id membership -- so "Accept all" on a registration holding a
 * scored entry rewrote it silently, with no dialog and no count.
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

  it('covers MISSING_INFO, which is not a BulkEntryAction but is offered by the Actions menu', () => {
    const eligible = getEligibleForBulkStatusChange(
      [entry('scored', EntryStatus.COMPLETED), entry('open', EntryStatus.PENDING)],
      EntryStatus.MISSING_INFO
    );
    expect(eligible.map(item => item.id)).toEqual(['open']);
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
