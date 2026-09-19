/**
 * MYK9-639 round 4: the refund dialog posts the row that HOLDS the payment.
 *
 * Round 3 made the destination pass `isStripeRefundable` by rooting its money,
 * which is right — but the target was still resolved by a second lookup over
 * the card's OWN entry array, from which `buildMoneyAttribution` has already
 * removed the superseded source. The lookup therefore fell back to the
 * money-neutral row and `stripe-refund-entry` 422'd every time: round 2 hid a
 * control that should have existed, round 3 showed one that could not complete.
 *
 * The stamp the mapper puts on the row is now the only answer, and this drives
 * the REAL dialog to prove the id that reaches the edge function.
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));

// The dialog imports supabase from '@/lib/supabase'.
vi.mock('@/lib/supabase', () => ({
  // `auth` is stubbed too: the test renderer wraps in AuthProvider, which calls
  // getSession/onAuthStateChange on mount.
  supabase: {
    functions: { invoke: mocks.invoke },
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
      }),
    }),
  },
}));

// The withdrawal-policy suggestion is a separate concern; stub it so the
// confirm button's enabled state depends only on the amount.
vi.mock('@/features/payments/useWithdrawalRefundSuggestion', () => ({
  useWithdrawalRefundSuggestion: () => ({ data: null, isLoading: false }),
}));

import { RefundEntryDialog } from './RefundEntryDialog';

describe('RefundEntryDialog target (MYK9-639)', () => {
  it('posts the money root, not the run, for a moved-up dog', async () => {
    mocks.invoke.mockResolvedValue({ data: { ok: true }, error: null });

    render(
      <RefundEntryDialog
        open
        onOpenChange={() => {}}
        entry={{
          id: 'destination',
          dogName: 'Acorn',
          totalFee: 35,
          moneyRootEntryId: 'source-moved',
        }}
        onRefunded={() => {}}
      />
    );

    // Partial mode with an explicit amount, so the button is enabled without
    // depending on a withdrawal-policy suggestion this test does not stub.
    await userEvent.click(await screen.findByRole('radio', { name: /partial amount/i }));
    await userEvent.type(screen.getByLabelText(/^amount/i), '10');

    const issue = screen.getByRole('button', { name: /issue refund/i });
    await waitFor(() => expect(issue).toBeEnabled());
    await userEvent.click(issue);

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalled());
    const [fnName, options] = mocks.invoke.mock.calls[0] as [
      string,
      { body: { entry_id: string } },
    ];
    expect(fnName).toBe('stripe-refund-entry');
    expect(options.body.entry_id).toBe('source-moved');
  });

  it('posts its own id for an entry that was never moved', async () => {
    mocks.invoke.mockResolvedValue({ data: { ok: true }, error: null });

    render(
      <RefundEntryDialog
        open
        onOpenChange={() => {}}
        entry={{ id: 'plain', dogName: 'Bella', totalFee: 35, moneyRootEntryId: 'plain' }}
        onRefunded={() => {}}
      />
    );

    // Partial mode with an explicit amount, so the button is enabled without
    // depending on a withdrawal-policy suggestion this test does not stub.
    await userEvent.click(await screen.findByRole('radio', { name: /partial amount/i }));
    await userEvent.type(screen.getByLabelText(/^amount/i), '10');

    const issue = screen.getByRole('button', { name: /issue refund/i });
    await waitFor(() => expect(issue).toBeEnabled());
    await userEvent.click(issue);

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalled());
    const [, options] = mocks.invoke.mock.calls[0] as [string, { body: { entry_id: string } }];
    expect(options.body.entry_id).toBe('plain');
  });
});
