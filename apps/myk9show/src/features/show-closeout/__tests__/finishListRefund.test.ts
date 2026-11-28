import { describe, expect, it } from 'vitest';

import { getEntryListHref } from '@/components/entries/management/entryManagementViews';
import type { ShowDayReconciliationEntry } from '@/features/show-workbench/showDayReconciliationSummary';
import { buildFinishList } from '../finishList';
import { calculateResultsRowsLeft } from '../fromResultsRows';
import { REFUND_PAYOUT_NOTE } from '../refundFinishItem';

function removal(id: string, overrides: Partial<ShowDayReconciliationEntry> = {}) {
  return {
    id,
    entry_status: 'withdrawn',
    payment_status: 'paid',
    payment_method: 'online',
    ...overrides,
  } satisfies ShowDayReconciliationEntry;
}

function refundItem(entries: ShowDayReconciliationEntry[]) {
  const left = calculateResultsRowsLeft([], [{ id: 't1', registry_id: 'AKC' }], {
    submissions: null,
    entries,
  });
  return buildFinishList('show-1', left).find(item => item.key === 'refund-review');
}

describe('Finish the show: refund line', () => {
  it('lists the refunds to decide, links to Pulls and says when the payout runs', () => {
    const item = refundItem([removal('e1'), removal('e2')]);
    expect(item).toMatchObject({
      key: 'refund-review',
      state: 'open',
      label: '2 refunds to decide',
      href: getEntryListHref('show-1', 'pulls'),
      opensClassList: false,
      note: "Your club's payout is promised within five business days of the show's last day.",
    });
  });

  it('states the promise in words, never a date from the device copy of the show (PR #4509)', () => {
    const note = refundItem([removal('e1')])?.note ?? '';
    expect(note).toBe(REFUND_PAYOUT_NOTE);
    expect(note).not.toMatch(
      /January|February|March|April|May|June|July|August|September|October|November|December/
    );
    expect(note).not.toMatch(/\d/);
  });

  it('never says a transfer is pending', () => {
    expect(refundItem([removal('e1')])?.note).not.toMatch(/sent|go out|before/i);
    expect(REFUND_PAYOUT_NOTE).not.toContain('\u2014');
  });

  it('reads unknown, even with no removals in the snapshot, when the entries are not readable', () => {
    const left = calculateResultsRowsLeft([], [{ id: 't1', registry_id: 'AKC' }], {
      submissions: null,
      entries: [],
      entriesReadable: false,
    });
    const item = buildFinishList('show-1', left).find(
      candidate => candidate.key === 'refund-review'
    );
    expect(item).toMatchObject({ state: 'unknown', href: null });
    expect(item?.note).toBeUndefined();
  });

  it('is unknown, with no note, when the saved decisions could not be read', () => {
    const item = refundItem([removal('e1', { refund_decision_unknown: true })]);
    expect(item).toMatchObject({ state: 'unknown', href: null });
    expect(item?.note).toBeUndefined();
  });

  it('is not listed when no refund is left to decide', () => {
    expect(refundItem([removal('e1', { refund_decision: 'denied' })])).toBeUndefined();
    expect(refundItem([])).toBeUndefined();
  });
});
