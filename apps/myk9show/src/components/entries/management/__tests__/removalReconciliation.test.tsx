/**
 * MYK9-632: a paid entry an exhibitor LEFT must reach the secretary's refund
 * queue and say, in the queue, which act it was and whose rules decide the money.
 *
 * Owner decision 2026-09-17: a paid entry can be withdrawn as well as pulled,
 * and neither act moves a cent. That is only safe if the decision is REACHABLE
 * afterwards — an unreachable decision is an entry the exhibitor paid for, did
 * not run, and nobody can resolve.
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { PullReconciliationCard } from '../PullReconciliationCard';
import { removalSummaryLine } from '../removalSummaryLine';
import { buildLedgerRows } from '@/features/payments/payoutLedger';

const rpc = vi.hoisted(() => vi.fn());

// Mocked at the RPC BOUNDARY, with the real `denyPullRefundDecision` and the
// real server predicate above it: the round-4 defect was that the queue offered
// a Deny control whose RPC call could only ever raise, and a mocked
// `denyPullRefundDecision` would have hidden exactly that.
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    // The render tree's providers touch these; only `rpc` is under test.
    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
      }),
    }),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
    removeChannel: () => {},
  },
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

  // A 'withdrawn' row with NO reason code is a SECRETARY removal (Decline /
  // Reject -> rejectEntry) or a pre-MYK9-632 row, not an exhibitor's act. The
  // reconciliation queue excludes it, so a line promising "refund per the
  // premium" would advertise an obligation nobody agreed to and that no surface
  // can resolve.
  it('says nothing about money for a withdrawn row with NO reason code', () => {
    expect(removalSummaryLine({ rawEntryStatus: 'withdrawn' })).toBe('Withdrawn');
    expect(removalSummaryLine({ rawEntryStatus: 'withdrawn' })).not.toMatch(/refund/i);
    expect(removalSummaryLine({ rawEntryStatus: 'withdrawn', withdrawalReasonCode: null })).toBe(
      'Withdrawn'
    );
    expect(removalSummaryLine({ rawEntryStatus: 'withdrawn', withdrawalReasonCode: 'other' })).toBe(
      'Withdrawn'
    );
  });

  it('keeps the secretary note on a codeless withdrawal, still without a refund claim', () => {
    const line = removalSummaryLine({
      rawEntryStatus: 'withdrawn',
      withdrawalReason: 'Class limit reached',
    });
    expect(line).toBe('Withdrawn · Class limit reached');
    expect(line).not.toMatch(/refund/i);
  });

  // ...but once a decision EXISTS it is still reported, whatever wrote the row.
  it('still reports a decision on a codeless withdrawal', () => {
    expect(removalSummaryLine({ rawEntryStatus: 'withdrawn', refundDecision: 'denied' })).toBe(
      'Withdrawn · refund denied'
    );
  });

  it('falls back to the reason code when the raw status is not projected', () => {
    expect(removalSummaryLine({ withdrawalReasonCode: 'judge_change' })).toContain('Withdrawn');
    expect(removalSummaryLine({})).toContain('Pulled');
  });
});

/**
 * MYK9-632 round 5: the queue's READ half and its WRITE half must admit the same
 * rows. A Deny control that always raises is worse than no control — the row
 * never leaves the queue and the admin's unresolved count carries it forever.
 */

/** The shape `set_entry_refund_decision` reads off the row. */
interface ServerRow {
  entry_status: string | null;
  payment_method: string | null;
  payment_status: string | null;
  refund_amount: number | null;
  refund_decision: string | null;
  withdrawal_reason_code: string | null;
}

/**
 * The SQL guard, TRANSCRIBED — deliberately not the TS predicate.
 *
 * `isUnresolvedRemovalRefundDecision` is the READ half. Driving the fake with it
 * would assert that half against itself: the test would stay green if the
 * migration's widening were reverted and the Deny click started raising 22023
 * again, which is the exact defect round 5 found. This mirrors the guard in
 * `supabase/migrations/20260917214300_withdraw_or_pull_own_entry.sql` statement
 * for statement, including the COALESCEs that stop a NULL `entry_status` falling
 * through it.
 *
 * KEPT IN STEP BY HAND. Nothing links the two, so a change to that guard must be
 * copied here in the same commit. The behavioural proof that the REAL function
 * agrees lives in `supabase/tests/withdraw_or_pull_own_entry_test.sql`; this only
 * proves the client reaches a server that would accept it.
 */
function sqlGuardAdmits(row: ServerRow): boolean {
  const status = row.entry_status ?? '';
  const reasonCode = row.withdrawal_reason_code ?? '';
  return (
    (row.payment_method ?? '') === 'online' &&
    (row.payment_status ?? '') === 'paid' &&
    (row.refund_amount ?? 0) <= 0 &&
    (status === 'scratched' ||
      (status === 'withdrawn' && ['in_season', 'judge_change'].includes(reasonCode)))
  );
}

const CODED_WITHDRAWAL: ServerRow = {
  entry_status: 'withdrawn',
  payment_method: 'online',
  payment_status: 'paid',
  refund_amount: null,
  refund_decision: null,
  withdrawal_reason_code: 'in_season',
};

const CODELESS_WITHDRAWAL: ServerRow = { ...CODED_WITHDRAWAL, withdrawal_reason_code: null };

describe('Deny refund reaches a server that accepts it', () => {
  /** Point the fake RPC at one row, applying the transcribed SQL guard. */
  function serveRow(row: ServerRow) {
    rpc.mockReset();
    rpc.mockImplementation((name: string, args: { p_entry_id: string }) => {
      if (name !== 'set_entry_refund_decision') return Promise.resolve({ error: null });
      if (!sqlGuardAdmits(row)) {
        return Promise.resolve({
          error: {
            code: '22023',
            message: `entry ${args.p_entry_id} is not an unresolved paid-online pull or withdrawal`,
          },
        });
      }
      return Promise.resolve({ error: null });
    });
  }

  it('saves the denial instead of erroring forever', async () => {
    serveRow(CODED_WITHDRAWAL);
    const onResolved = vi.fn();
    render(
      <PullReconciliationCard
        entry={withdrawnEntry('in_season')}
        onOpenRefund={vi.fn()}
        onResolved={onResolved}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /deny refund/i }));

    await waitFor(() => expect(onResolved).toHaveBeenCalled());
    expect(rpc).toHaveBeenCalledWith('set_entry_refund_decision', {
      p_entry_id: 'entry-1',
      p_decision: 'denied',
    });
  });

  // The other half of the contract. If the transcribed guard ever stops refusing
  // this, it has drifted from the migration and the case above is worthless.
  it('is refused by that same guard for a CODELESS withdrawn row', async () => {
    serveRow(CODELESS_WITHDRAWAL);
    const onResolved = vi.fn();
    render(
      <PullReconciliationCard
        entry={withdrawnEntry('in_season')}
        onOpenRefund={vi.fn()}
        onResolved={onResolved}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /deny refund/i }));

    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(onResolved).not.toHaveBeenCalled();
  });

  it('transcribes the guard, and the transcription still refuses what it should', () => {
    expect(sqlGuardAdmits(CODED_WITHDRAWAL)).toBe(true);
    expect(sqlGuardAdmits({ ...CODED_WITHDRAWAL, withdrawal_reason_code: 'judge_change' })).toBe(
      true
    );
    expect(sqlGuardAdmits({ ...CODED_WITHDRAWAL, entry_status: 'scratched' })).toBe(true);
    expect(sqlGuardAdmits(CODELESS_WITHDRAWAL)).toBe(false);
    expect(sqlGuardAdmits({ ...CODED_WITHDRAWAL, withdrawal_reason_code: 'other' })).toBe(false);
    expect(sqlGuardAdmits({ ...CODED_WITHDRAWAL, payment_method: null })).toBe(false);
    expect(sqlGuardAdmits({ ...CODED_WITHDRAWAL, payment_status: 'pending' })).toBe(false);
    expect(sqlGuardAdmits({ ...CODED_WITHDRAWAL, refund_amount: 25 })).toBe(false);
    // The COALESCE the migration carries: a NULL status must not fall through.
    expect(sqlGuardAdmits({ ...CODED_WITHDRAWAL, entry_status: null })).toBe(false);
  });
});

describe('the unresolved count drops once the decision is recorded', () => {
  const ledgerRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'entry-1',
    show_id: 'show-1',
    entry_status: 'withdrawn',
    entry_fee: 25,
    payment_method: 'online',
    payment_status: 'paid',
    refund_amount: null,
    refund_decision: null,
    withdrawal_reason_code: 'in_season',
    ...overrides,
  });

  it('counts a coded paid-online withdrawal, then stops once it is denied', () => {
    const shows = [{ id: 'show-1', name: 'Spring Trial', club_id: 'club-1' }];
    const before = buildLedgerRows(
      shows as never,
      new Map([['show-1', [ledgerRow()]]]) as never,
      new Map()
    );
    const after = buildLedgerRows(
      shows as never,
      new Map([['show-1', [ledgerRow({ refund_decision: 'denied' })]]]) as never,
      new Map()
    );

    expect(before[0]?.unresolvedRefundDecisionCount).toBe(1);
    expect(after[0]?.unresolvedRefundDecisionCount).toBe(0);
  });
});
