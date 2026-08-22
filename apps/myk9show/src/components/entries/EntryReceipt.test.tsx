import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
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
  it('prints the Stripe amount and reference rather than re-summing class fees', () => {
    render(
      <EntryReceipt
        open
        onOpenChange={vi.fn()}
        entry={{
          ...entry,
          amountCharged: 65,
          currency: 'usd',
          paymentReference: 'pi_split_order_1',
        }}
      />
    );

    expect(screen.getByText('$65.00')).toBeInTheDocument();
    expect(screen.getByText('Amount charged')).toBeInTheDocument();
    expect(screen.getByText('pi_split_order_1')).toBeInTheDocument();
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
