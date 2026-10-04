/**
 * MYK9-987: the closeout card and the Entries "Pulls" view once disagreed on
 * "pulled" (closeout counted every withdrawal and absence, the Pulls view only
 * real pulls). Both now classify through `classifyEntryRemoval`; Pull and
 * Withdraw are never synonyms (LESSONS pull-vs-withdraw).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { within } from '@testing-library/react';
import {
  classifyEntryRemoval,
  describeEntryRemovals,
  isExhibitorRemoval,
} from '@/features/payments/pullReconciliation';
import { ShowCloseoutSummary } from '../ShowCloseoutSummary';
import {
  summarizeShowDayReconciliation,
  type ShowDayReconciliationEntry,
} from '../showDayReconciliationSummary';
import { buildCloseoutReadiness } from '../showCloseOutShow';

const mockListShowIncidentCloseout = vi.hoisted(() => vi.fn());
const mockListShowPayments = vi.hoisted(() => vi.fn());

vi.mock('@/services/database/show-payments', () => ({
  listShowPayments: mockListShowPayments,
  showPaymentsQueryKey: (showId: string) => ['show-payments', showId],
}));
vi.mock('@/services/database/show-incidents', () => ({
  listShowIncidentCloseout: mockListShowIncidentCloseout,
  showIncidentCloseoutQueryKey: (showId: string) => ['show-incidents', showId, 'closeout'],
}));

/** The demo state: two reasonless withdrawals, refunded. */
const DEMO_ENTRIES: ShowDayReconciliationEntry[] = [
  {
    id: 'a',
    entry_fee: 30,
    entry_status: 'withdrawn',
    withdrawal_reason_code: null,
    payment_status: 'refunded',
  },
  {
    id: 'b',
    entry_fee: 30,
    entry_status: 'withdrawn',
    withdrawal_reason_code: null,
    payment_status: 'refunded',
  },
  { id: 'c', entry_fee: 30, entry_status: 'confirmed', payment_status: 'paid' },
];

/** What the Entries Pulls view lists, as the page applies it. */
function pullsViewCount(entries: ShowDayReconciliationEntry[]): number {
  return entries.filter(entry =>
    isExhibitorRemoval(
      classifyEntryRemoval({
        entryStatus: entry.entry_status,
        withdrawalReasonCode: entry.withdrawal_reason_code,
      })
    )
  ).length;
}

describe('classifyEntryRemoval', () => {
  it.each([
    [{ entryStatus: 'scratched' }, 'pulled'],
    [{ entryStatus: 'confirmed', checkInStatus: 'pulled' }, 'pulled'],
    [{ entryStatus: 'withdrawn', withdrawalReasonCode: 'in_season' }, 'withdrawn'],
    [{ entryStatus: 'withdrawn', withdrawalReasonCode: 'judge_change' }, 'withdrawn'],
    [{ entryStatus: 'withdrawn', withdrawalReasonCode: null }, 'removed'],
    [{ entryStatus: 'withdrawn' }, 'removed'],
    [{ entryStatus: 'absent' }, 'absent'],
    [{ entryStatus: 'confirmed' }, null],
  ] as const)('%j is %s', (input, expected) => {
    expect(classifyEntryRemoval(input)).toBe(expected);
  });

  it('lists only pulls and reasoned withdrawals in the Pulls view', () => {
    expect(isExhibitorRemoval('pulled')).toBe(true);
    expect(isExhibitorRemoval('withdrawn')).toBe(true);
    expect(isExhibitorRemoval('removed')).toBe(false);
    expect(isExhibitorRemoval('absent')).toBe(false);
    expect(isExhibitorRemoval(null)).toBe(false);
  });
});

describe('closeout and the Pulls view on the demo state', () => {
  it('agree: the two reasonless withdrawals are secretary removals, not pulls', () => {
    const summary = summarizeShowDayReconciliation(DEMO_ENTRIES, null);

    expect(pullsViewCount(DEMO_ENTRIES)).toBe(0);
    expect(summary.removals.pulled + summary.removals.withdrawn).toBe(0);
    expect(summary.removals.removed).toBe(2);
    expect(summary.refundedRemovals.removed).toBe(2);
    expect(describeEntryRemovals(summary.refundedRemovals)).toBe('2 removed by the secretary');
  });

  it('sorts a real pull, an in-season withdrawal, a removal and an absence into their own buckets', () => {
    const summary = summarizeShowDayReconciliation(
      [
        { id: 'p', entry_status: 'scratched', payment_status: 'paid', entry_fee: 10 },
        {
          id: 'w',
          entry_status: 'withdrawn',
          withdrawal_reason_code: 'in_season',
          payment_status: 'pending',
        },
        { id: 'r', entry_status: 'withdrawn', payment_status: 'pending' },
        { id: 'x', entry_status: 'absent', payment_status: 'pending' },
      ],
      null
    );

    expect(summary.removals).toEqual({ pulled: 1, withdrawn: 1, removed: 1, absent: 1 });
    expect(summary.removalCount).toBe(4);
    expect(summary.refundReviewRemovals).toEqual({
      pulled: 1,
      withdrawn: 0,
      removed: 0,
      absent: 0,
    });
  });

  it('still gates close-out on a paid secretary removal, naming it as such', () => {
    const readiness = buildCloseoutReadiness({
      classes: [],
      entries: [{ id: 'r', entry_fee: 20, entry_status: 'withdrawn', payment_status: 'paid' }],
      incidents: { reportableCount: 0, urgentCount: 0 },
      submissions: [],
    });

    expect(readiness.concerns).toContain(
      '1 paid entry (1 removed by the secretary) needs refund review.'
    );
  });
});

describe('ShowCloseoutSummary labels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListShowIncidentCloseout.mockResolvedValue([]);
    mockListShowPayments.mockResolvedValue([]);
  });

  it('says "removed by the secretary" for the demo withdrawals, never "pulled"', async () => {
    render(<ShowCloseoutSummary showId="show-1" deskWindow={null} entries={DEMO_ENTRIES} />);

    const tile = screen.getByRole('group', { name: 'Pulled or withdrawn entries' });
    expect(within(tile).getByText('0')).toBeInTheDocument();
    expect(within(tile).getByText('2 removed by the secretary')).toBeInTheDocument();
    expect(await screen.findByText('2 removed by the secretary · 0 review')).toBeInTheDocument();
    expect(
      screen.getByText(/2 removed by the secretary:\s*\$60\.00 marked refunded\./)
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\d+ pulled/);
  });
});
