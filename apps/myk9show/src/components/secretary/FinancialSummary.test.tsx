/**
 * The per-trial Financial Summary card (MYK9-639 round 3).
 *
 * This component had no spec at all, which is how it came to compute
 * `unresolvedMoneyRootCount` and destructure it away — and the per-trial card is
 * precisely where an out-of-scope money root is ROUTINE: `buildMoveUpTargets`
 * offers every class in the SHOW, and `move_up_entry` only requires the same
 * show, so a Trial 1 → Trial 2 move-up puts the fee in one card's scope and the
 * run in another's.
 */
import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';

const mocks = vi.hoisted(() => ({ useTrialEntries: vi.fn() }));

vi.mock('@/hooks/queries/useTrialEntries', () => ({
  useTrialEntries: (...args: unknown[]) => mocks.useTrialEntries(...args),
}));

import { FinancialSummary } from './FinancialSummary';

function rawEntry(overrides: Record<string, unknown>) {
  return {
    id: 'entry-1',
    handler: 'Jane Handler',
    entry_fee: 35,
    discount_amount: 0,
    payment_status: 'paid',
    comped: false,
    comped_reason: null,
    entry_status: 'confirmed',
    dog: { call_name: 'Acorn', owner: { first_name: 'Jane', last_name: 'Handler' } },
    class: { name: 'Interior Novice A' },
    promo_code: null,
    ...overrides,
  };
}

function renderSummary(entries: Record<string, unknown>[]) {
  mocks.useTrialEntries.mockReturnValue({ data: entries, isLoading: false });
  return render(<FinancialSummary trialId="trial-1" />);
}

describe('FinancialSummary (per trial)', () => {
  it('shows a whole trial of ordinary entries without a warning', () => {
    renderSummary([rawEntry({ id: 'a' }), rawEntry({ id: 'b' })]);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('WARNS when a run was moved up from outside this trial, instead of reporting $0', () => {
    // Trial 2's card holds only the destination; the $35 lives on a source in
    // Trial 1, which this array cannot see. Before, the card silently read
    // "1 entry, $0.00" and the money vanished from both trials' cards.
    renderSummary([
      rawEntry({
        id: 'destination',
        entry_fee: 0,
        payment_status: 'pending',
        class: { name: 'Interior Advanced A' },
        moved_from_entry_id: 'source-in-trial-1',
      }),
    ]);

    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent(/moved up from outside this view/i);
    expect(notice).toHaveTextContent(/show-level Financial Summary counts them/i);
  });

  it('counts a WHOLE move-up pair inside one trial once, at the fee actually paid', () => {
    renderSummary([
      rawEntry({ id: 'source-moved', entry_status: 'moved' }),
      rawEntry({
        id: 'destination',
        entry_fee: 0,
        payment_status: 'pending',
        class: { name: 'Interior Advanced A' },
        moved_from_entry_id: 'source-moved',
      }),
    ]);

    // One run, $35 — not two entries, and not $0.
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getAllByText('$35.00').length).toBeGreaterThan(0);
  });

  // MYK9-811: the raw <Select> payment-status filter moved onto the shared
  // list-toolkit filter bar.
  describe('payment-status filter (list toolkit)', () => {
    it('filters the entry table by the picked payment status', async () => {
      const { user } = renderSummary([
        rawEntry({ id: 'paid-1', payment_status: 'paid', dog: { call_name: 'Acorn' } }),
        rawEntry({ id: 'pending-1', payment_status: 'pending', dog: { call_name: 'Birch' } }),
      ]);

      await user.click(screen.getByRole('button', { name: /filter/i }));
      await user.click(screen.getByRole('button', { name: /^Payment status$/ }));
      await user.click(screen.getByRole('button', { name: /^Pending/ }));

      expect(screen.getByText('Birch')).toBeInTheDocument();
      expect(screen.queryByText('Acorn')).not.toBeInTheDocument();
    });

    it('searches across dog, owner, handler and class', async () => {
      const { user } = renderSummary([
        rawEntry({ id: 'a', dog: { call_name: 'Acorn' } }),
        rawEntry({ id: 'b', dog: { call_name: 'Birch' } }),
      ]);

      await user.type(screen.getByPlaceholderText('Search entries...'), 'Birch');

      expect(screen.getByText('Birch')).toBeInTheDocument();
      expect(screen.queryByText('Acorn')).not.toBeInTheDocument();
    });

    it('counts comped separately from its raw paid payment_status', async () => {
      const { user } = renderSummary([
        rawEntry({ id: 'a', payment_status: 'paid', comped: false }),
        rawEntry({ id: 'b', payment_status: 'paid', comped: true }),
      ]);

      await user.click(screen.getByRole('button', { name: /filter/i }));
      await user.click(screen.getByRole('button', { name: /^Payment status$/ }));
      const menu = screen.getByRole('group', { name: /payment status/i });
      const paidOption = within(menu).getByRole('button', { name: /^Paid/ });
      expect(paidOption).toHaveTextContent('1');
      const compedOption = within(menu).getByRole('button', { name: /^Comped/ });
      expect(compedOption).toHaveTextContent('1');
    });
  });
});
