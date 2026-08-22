import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { within } from '@testing-library/react';
import { render, screen } from '@/test/utils/testUtils';
import { EntryReceipt } from './EntryReceipt';

const entry = {
  id: 'entry-1',
  confirmationNumber: 'MK9-000123',
  showName: 'Heartland Trial',
  showDate: new Date('2026-08-01T12:00:00Z'),
  location: {
    venue: 'County Fairgrounds',
    city: 'Tulsa',
    state: 'OK',
  },
  dogName: 'Cooper',
  handler: 'Jane Smith',
  classes: [
    {
      id: 'class-1',
      name: 'Novice A',
      number: '101',
      fee: 30,
      status: 'entered' as const,
    },
  ],
  totalFee: 30,
  submittedAt: new Date('2026-07-01T12:00:00Z'),
  paymentStatus: 'Paid',
};

describe('EntryReceipt', () => {
  it('prints a breakdown whose parts add up to the Stripe amount', () => {
    // The receipt must not state a total its own line items do not reach. The
    // platform fee is charged as its own Stripe line on top of the entry fees,
    // so it needs a row of its own or the document is out of balance.
    render(
      <EntryReceipt
        open
        onOpenChange={vi.fn()}
        entry={{
          ...entry,
          charge: {
            entrySubtotal: 60,
            platformFee: 5,
            overflowCharged: 0,
            amountCharged: 65,
            refunded: 0,
            netPaid: 65,
          },
          currency: 'usd',
          paymentReference: 'pi_split_order_1',
          orderId: 'order-split-1',
        }}
      />
    );

    const totals = within(screen.getByText('Entry fees').closest('dl') as HTMLElement);
    expect(totals.getByText('$60.00')).toBeInTheDocument();
    expect(totals.getByText('Platform fee')).toBeInTheDocument();
    expect(totals.getByText('$5.00')).toBeInTheDocument();
    expect(totals.getByText('Amount charged')).toBeInTheDocument();
    expect(totals.getByText('$65.00')).toBeInTheDocument();
    expect(screen.getByText('pi_split_order_1')).toBeInTheDocument();
    expect(screen.getByText('Order ID')).toBeInTheDocument();
    expect(screen.getByText('order-split-1')).toBeInTheDocument();
    expect(screen.getByText('Entry ID: entry-1')).toBeInTheDocument();
  });

  it('prints the entry-fee total and claims no charge without a breakdown', () => {
    // The card-derived receipt: cash, check, or a Stripe order we could not
    // read. It must not label anything "Amount charged".
    render(<EntryReceipt open onOpenChange={vi.fn()} entry={entry} />);

    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.queryByText('Amount charged')).not.toBeInTheDocument();
    expect(screen.queryByText('Platform fee')).not.toBeInTheDocument();
  });

  it('shows the refund and the net when money came back', () => {
    render(
      <EntryReceipt
        open
        onOpenChange={vi.fn()}
        entry={{
          ...entry,
          charge: {
            entrySubtotal: 60,
            platformFee: 5,
            overflowCharged: 0,
            amountCharged: 65,
            refunded: 20,
            netPaid: 45,
          },
          currency: 'usd',
        }}
      />
    );

    const totals = within(screen.getByText('Entry fees').closest('dl') as HTMLElement);
    expect(totals.getByText('Refunded')).toBeInTheDocument();
    expect(totals.getByText('-$20.00')).toBeInTheDocument();
    expect(totals.getByText('Net paid')).toBeInTheDocument();
    expect(totals.getByText('$45.00')).toBeInTheDocument();
  });

  it('falls back to USD rather than blanking the receipt on a bad currency code', () => {
    // Intl throws RangeError on a malformed code; losing one symbol beats
    // losing the whole document.
    render(
      <EntryReceipt
        open
        onOpenChange={vi.fn()}
        entry={{
          ...entry,
          currency: 'not-a-currency',
          charge: {
            entrySubtotal: 60,
            platformFee: 5,
            overflowCharged: 0,
            amountCharged: 65,
            refunded: 0,
            netPaid: 65,
          },
        }}
      />
    );

    const totals = within(screen.getByText('Entry fees').closest('dl') as HTMLElement);
    expect(totals.getByText('$65.00')).toBeInTheDocument();
  });

  it('preserves the common card receipt total when no Stripe amount was supplied', () => {
    render(
      <EntryReceipt
        open
        onOpenChange={vi.fn()}
        entry={{
          ...entry,
          totalFee: 50,
          classes: [
            ...entry.classes,
            {
              id: 'class-2',
              name: 'Advanced A',
              number: '201',
              fee: 20,
              status: 'scratched',
            },
          ],
        }}
      />
    );

    expect(screen.getAllByText('$30.00')).toHaveLength(2);
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.queryByText('$50.00')).not.toBeInTheDocument();
  });

  it('prints the confirmation label without an uppercase transform', async () => {
    const write = vi.fn();
    const printWindow = {
      document: {
        write,
        close: vi.fn(),
      },
      focus: vi.fn(),
      print: vi.fn(),
      close: vi.fn(),
    };
    vi.spyOn(window, 'open').mockReturnValue(printWindow as unknown as Window);

    render(<EntryReceipt open onOpenChange={vi.fn()} entry={entry} />);

    await userEvent.click(screen.getByRole('button', { name: /print/i }));

    const printedHtml = String(write.mock.calls[0]?.[0] ?? '');
    expect(printedHtml).toContain('Confirmation #');
    expect(printedHtml).not.toMatch(
      /\\.confirmation-label\\s*\\{[^}]*text-transform:\\s*uppercase/s
    );
  });
});
