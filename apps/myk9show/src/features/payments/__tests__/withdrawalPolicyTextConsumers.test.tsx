/**
 * MYK9-1976: every surface that shows the refund and withdrawal policy prints the club's own
 * text, as one block with its line breaks: checkout (cart and the secretary's payment link),
 * the Pull or withdraw chooser, the secretary's refund dialog and the show's About facts.
 * The text and its precedence are resolved by `useEffectiveWithdrawalPolicy` (tested with the
 * real read in WithdrawalPolicyDisclosure.test.tsx); here it answers with the club's text.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { RemoveFromClassDialog } from '@/components/entries/RemoveFromClassDialog';
import { RefundEntryDialog } from '@/components/entries/management/RefundEntryDialog';
import { RequestPaymentDialog } from '@/components/entries/management/RequestPaymentDialog';
import { CartSummary } from '@/components/cart/CartSummary';
import { ShowAboutWithdrawal } from '@/components/shows/about/ShowAboutFacts';
import { useCartStore } from '@/store/cartStore';
import type { CartWithDetails } from '@/store/cartStore.types';

const CLUB_TEXT = 'Heartland Kennel Club policy.\nWithdrawals follow the AKC rule.';

const hook = vi.hoisted(() => vi.fn());
vi.mock('@/features/payments/useEffectiveWithdrawalPolicy', () => ({
  useEffectiveWithdrawalPolicy: (showId: string | null | undefined) => hook(showId),
}));
vi.mock('@/features/payments/useWithdrawalRefundSuggestion', () => ({
  useWithdrawalRefundSuggestion: () => ({ data: undefined, isLoading: false }),
}));

function expectClubText() {
  const blocks = screen.getAllByTestId('withdrawal-policy-text');
  expect(blocks.some(block => block.textContent === CLUB_TEXT)).toBe(true);
  // Codex P2: the club's text never replaces the service-fee sentence.
  expect(screen.getAllByText('Service fees are non-refundable.').length).toBeGreaterThan(0);
}

beforeEach(() => {
  hook.mockImplementation((showId: string | null | undefined) =>
    showId === 'show-1'
      ? {
          data: { policy: null, text: CLUB_TEXT, textSource: 'club', registryId: 'AKC' },
          isLoading: false,
          isError: false,
        }
      : { data: undefined, isLoading: false, isError: false }
  );
});

afterEach(() => {
  useCartStore.setState({ cart: null });
});

const entry = {
  id: 'entry-1',
  showId: 'show-1',
  dogName: 'Rex',
  totalFee: 30,
  paymentMethod: 'online',
  paymentStatus: 'paid_online',
  refundedAt: null,
} as unknown as EntryManagementEntry;

describe("the club's policy text on every policy surface", () => {
  it('the Pull or withdraw chooser', () => {
    render(
      <RemoveFromClassDialog
        open
        classId="class-1"
        className="Container Novice A"
        registry={{ status: 'resolved', registry: 'AKC' }}
        showId="show-1"
        isSaving={false}
        onOpenChange={() => {}}
        onConfirm={() => {}}
      />
    );
    expectClubText();
    expect(hook).toHaveBeenCalledWith('show-1');
  });

  it('the Pull or withdraw chooser never goes silent offline (Codex P3)', () => {
    hook.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      fetchStatus: 'paused',
    });
    render(
      <RemoveFromClassDialog
        open
        classId="class-1"
        className="Container Novice A"
        registry={{ status: 'resolved', registry: 'AKC' }}
        showId="show-1"
        isSaving={false}
        onOpenChange={() => {}}
        onConfirm={() => {}}
      />
    );
    expect(screen.getByTestId('withdrawal-policy-unavailable')).toHaveTextContent(
      'The club’s refund policy can’t be shown offline. Withdraw and Pull work as described.'
    );
    expect(screen.getByRole('button', { name: 'Withdraw' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Pull' })).toBeEnabled();
  });

  it("the secretary's refund dialog", () => {
    render(<RefundEntryDialog open onOpenChange={() => {}} entry={entry} onRefunded={() => {}} />);
    expectClubText();
  });

  it("the secretary's payment link (checkout disclosure)", () => {
    render(
      <RequestPaymentDialog open onOpenChange={() => {}} entry={entry} onRequested={() => {}} />
    );
    expectClubText();
  });

  it("the exhibitor's cart (checkout disclosure)", () => {
    useCartStore.setState({
      cart: {
        id: 'cart-1',
        items: [{ id: 'item-1' }],
        subtotal_cents: 3000,
        show: {
          id: 'show-1',
          name: 'Spring Trial',
          start_date: '2026-06-10',
          entry_close_date: null,
        },
      } as unknown as CartWithDetails,
    });
    render(<CartSummary onCheckout={() => {}} />);
    expectClubText();
  });

  it("the show's About facts", () => {
    render(<ShowAboutWithdrawal showId="show-1" />);
    expectClubText();
    expect(screen.getByTestId('withdrawal-policy-text').textContent).toBe(CLUB_TEXT);
  });
});
