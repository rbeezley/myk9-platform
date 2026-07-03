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
    expect(printedHtml).not.toMatch(/\\.confirmation-label\\s*\\{[^}]*text-transform:\\s*uppercase/s);
  });
});
