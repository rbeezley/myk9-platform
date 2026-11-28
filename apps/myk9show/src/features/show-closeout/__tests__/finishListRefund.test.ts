import { describe, expect, it } from 'vitest';

import { getEntryListHref } from '@/components/entries/management/entryManagementViews';
import { payoutDueDate, payoutTimeline } from '@/features/payments/payoutDeadline';
import { formatPayoutDay } from '@/features/payments/payoutStage';
import type { ShowDayReconciliationEntry } from '@/features/show-workbench/showDayReconciliationSummary';
import { buildFinishList } from '../finishList';
import { calculateResultsRowsLeft } from '../fromResultsRows';

const TIME_ZONE = 'America/Chicago';
const LAST_DAY = '2026-12-02';
const BEFORE_DUE = new Date('2026-12-03T18:00:00Z');
const AFTER_DUE = new Date('2026-12-14T18:00:00Z');

function removal(id: string, overrides: Partial<ShowDayReconciliationEntry> = {}) {
  return {
    id,
    entry_status: 'withdrawn',
    payment_status: 'paid',
    payment_method: 'online',
    ...overrides,
  } satisfies ShowDayReconciliationEntry;
}

function refundItem(
  entries: ShowDayReconciliationEntry[],
  schedule?: Parameters<typeof buildFinishList>[2]
) {
  const left = calculateResultsRowsLeft([], [{ id: 't1', registry_id: 'AKC' }], {
    submissions: null,
    entries,
  });
  return buildFinishList('show-1', left, schedule).find(item => item.key === 'refund-review');
}

describe('Finish the show: refund line', () => {
  it('lists the refunds to decide, links to Pulls and says when the payout runs', () => {
    const item = refundItem([removal('e1'), removal('e2')], {
      lastDay: LAST_DAY,
      timeZone: TIME_ZONE,
      now: BEFORE_DUE,
    });
    const dueDate = payoutDueDate(LAST_DAY);
    const timeline = payoutTimeline(LAST_DAY, TIME_ZONE, BEFORE_DUE);
    expect(dueDate).not.toBeNull();
    expect(item).toMatchObject({
      key: 'refund-review',
      state: 'open',
      label: '2 refunds to decide',
      href: getEntryListHref('show-1', 'pulls'),
      opensClassList: false,
    });
    expect(item?.note).toContain(formatPayoutDay(dueDate ?? '', timeline?.today ?? ''));
    expect(item?.note).not.toContain('—');
  });

  it('states the promise in words when the show has no last day', () => {
    const item = refundItem([removal('e1')], { lastDay: null, timeZone: TIME_ZONE });
    expect(item?.state).toBe('open');
    expect(item?.note).toContain('five business days');
    expect(item?.note).not.toMatch(/December/);
  });

  it('states the promise in words when the caller passes no schedule', () => {
    expect(refundItem([removal('e1')])?.note).toContain('five business days');
  });

  it('never shows a past date as the date the club is still paid by', () => {
    const item = refundItem([removal('e1')], {
      lastDay: LAST_DAY,
      timeZone: TIME_ZONE,
      now: AFTER_DUE,
    });
    const dueDate = payoutDueDate(LAST_DAY) ?? '';
    expect(item?.note).toContain(formatPayoutDay(dueDate, '2026-12-14'));
    expect(item?.note).toMatch(/was promised by/);
    expect(item?.note).not.toMatch(/sent|go out|before/i);
  });

  it('never says a transfer is pending, with or without a date', () => {
    const dated = refundItem([removal('e1')], {
      lastDay: LAST_DAY,
      timeZone: TIME_ZONE,
      now: BEFORE_DUE,
    });
    const undated = refundItem([removal('e1')]);
    for (const item of [dated, undated]) expect(item?.note).not.toMatch(/sent|go out|before/i);
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

  it('is unknown, with no date, when the saved decisions could not be read', () => {
    const item = refundItem([removal('e1', { refund_decision_unknown: true })], {
      lastDay: LAST_DAY,
      timeZone: TIME_ZONE,
      now: BEFORE_DUE,
    });
    expect(item).toMatchObject({ state: 'unknown', href: null });
    expect(item?.note).toBeUndefined();
  });

  it('is not listed when no refund is left to decide', () => {
    expect(
      refundItem([removal('e1', { refund_decision: 'denied' })], {
        lastDay: LAST_DAY,
        timeZone: TIME_ZONE,
        now: BEFORE_DUE,
      })
    ).toBeUndefined();
    expect(refundItem([])).toBeUndefined();
  });
});
