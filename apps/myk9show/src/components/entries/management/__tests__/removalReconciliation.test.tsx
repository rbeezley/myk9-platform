/**
 * MYK9-632: a paid entry an exhibitor LEFT must reach the secretary's refund
 * queue and say, in the queue, which act it was and whose rules decide the money.
 *
 * Owner decision 2026-09-17: a paid entry can be withdrawn as well as pulled,
 * and neither act moves a cent. That is only safe if the decision is REACHABLE
 * afterwards — an unreachable decision is an entry the exhibitor paid for, did
 * not run, and nobody can resolve.
 */
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { PullReconciliationCard } from '../PullReconciliationCard';
import { removalSummaryLine } from '../removalSummaryLine';

vi.mock('@/features/payments/denyPullRefundDecision', () => ({
  denyPullRefundDecision: vi.fn().mockResolvedValue('saved'),
}));

function makeEntry(overrides: Partial<EntryManagementEntry> = {}): EntryManagementEntry {
  return {
    id: 'entry-1',
    registrationId: '',
    entryNumber: '#1',
    showId: 'show-1',
    dogId: 'dog-1',
    dogName: 'Bravo',
    ownerName: 'Jane Smith',
    ownerEmail: 'jane@example.com',
    handlerName: 'Jane Smith',
    classes: [{ id: 'c1', name: 'Container Novice A', number: '101', fee: 25 }],
    totalFee: 25,
    paidAmount: 25,
    entryStatus: EntryStatus.SCRATCHED,
    rawEntryStatus: 'scratched',
    paymentStatus: PaymentStatus.PAID_ONLINE,
    paymentMethod: 'online',
    submittedAt: new Date('2026-01-01'),
    lastUpdated: new Date('2026-01-02'),
    pullTiming: 'before_close',
    refundDecision: null,
    ...overrides,
  } as EntryManagementEntry;
}

const withdrawnEntry = (reason: string) =>
  makeEntry({
    entryStatus: EntryStatus.CANCELLED,
    rawEntryStatus: 'withdrawn',
    withdrawalReasonCode: reason,
    pullTiming: null,
  });

describe('PullReconciliationCard — the queue names the act', () => {
  it('labels a paid withdrawal with its reason and whose rules decide', () => {
    render(
      <PullReconciliationCard
        entry={withdrawnEntry('in_season')}
        onOpenRefund={vi.fn()}
        onResolved={vi.fn()}
      />
    );

    expect(
      screen.getByText('Withdrawn · Dog in season · refund per the premium')
    ).toBeInTheDocument();
    expect(screen.queryByText(/club's discretion/i)).not.toBeInTheDocument();
  });

  it('still labels a pull as the club’s call', () => {
    render(
      <PullReconciliationCard entry={makeEntry()} onOpenRefund={vi.fn()} onResolved={vi.fn()} />
    );

    expect(screen.getByText(/Pulled — refund at the club's discretion/)).toBeInTheDocument();
  });

  it('offers the SAME refund controls for a withdrawal as for a pull', () => {
    const { unmount } = render(
      <PullReconciliationCard
        entry={withdrawnEntry('judge_change')}
        onOpenRefund={vi.fn()}
        onResolved={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /issue refund/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /deny refund/i })).toBeEnabled();
    unmount();
  });

  // The before/after-close chip answers a PULL question (the club's default).
  // A withdrawal's refund follows the premium, so the chip would be asserting a
  // rule it does not know.
  it('shows no pull-timing chip and pre-selects nothing for a withdrawal', () => {
    render(
      <PullReconciliationCard
        entry={withdrawnEntry('in_season')}
        onOpenRefund={vi.fn()}
        onResolved={vi.fn()}
      />
    );

    expect(screen.queryByText(/before close|after close|timing unknown/i)).not.toBeInTheDocument();
    for (const name of [/issue refund/i, /deny refund/i]) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false');
    }
  });
});

describe('removalSummaryLine — what is true about the money RIGHT NOW', () => {
  it('names the act and the deciding rules while the decision is open', () => {
    expect(removalSummaryLine({ rawEntryStatus: 'scratched' })).toBe(
      "Pulled · refund at the club's discretion"
    );
    expect(
      removalSummaryLine({ rawEntryStatus: 'withdrawn', withdrawalReasonCode: 'judge_change' })
    ).toBe('Withdrawn · Judge change · refund per the premium');
  });

  // The P3: a card that keeps offering "at the club's discretion" after the club
  // has already decided tells the secretary the decision is still open, and
  // invites a second refund on the same entry.
  it('reports the DECISION once one exists, on either act', () => {
    expect(removalSummaryLine({ rawEntryStatus: 'scratched', refundAmount: 25 })).toBe(
      'Pulled · refund issued'
    );
    expect(
      removalSummaryLine({ rawEntryStatus: 'scratched', refundedAt: '2026-09-17T00:00:00Z' })
    ).toBe('Pulled · refund issued');
    expect(removalSummaryLine({ rawEntryStatus: 'scratched', refundDecision: 'denied' })).toBe(
      'Pulled · refund denied'
    );
    expect(
      removalSummaryLine({
        rawEntryStatus: 'withdrawn',
        withdrawalReasonCode: 'in_season',
        refundDecision: 'denied',
      })
    ).toBe('Withdrawn · Dog in season · refund denied');
  });

  it('keeps the free-text note beside the enumerated reason', () => {
    expect(
      removalSummaryLine({
        rawEntryStatus: 'withdrawn',
        withdrawalReasonCode: 'in_season',
        withdrawalReason: 'vet certificate on file',
      })
    ).toBe('Withdrawn · Dog in season · vet certificate on file · refund per the premium');
  });

  it('falls back to the reason code when the raw status is not projected', () => {
    expect(removalSummaryLine({ withdrawalReasonCode: 'judge_change' })).toContain('Withdrawn');
    expect(removalSummaryLine({})).toContain('Pulled');
  });
});
