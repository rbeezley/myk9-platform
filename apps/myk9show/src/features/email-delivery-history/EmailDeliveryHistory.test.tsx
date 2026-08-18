import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { EmailDeliveryHistory } from './EmailDeliveryHistory';
import type { EmailDeliveryHistoryPage } from './api';

const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn<(...args: never[]) => Promise<EmailDeliveryHistoryPage>>(),
}));

vi.mock('./api', async importOriginal => {
  const actual = await importOriginal<typeof import('./api')>();
  return { ...actual, fetchShowEmailDeliveryHistory: mockFetch };
});

const row = {
  id: 'attempt-1',
  show_id: 'show-1',
  source_kind: 'entry_decision',
  lifecycle_step_type: null,
  related_id: 'entry-1',
  recipient_name: 'Jamie Handler',
  recipient_email: 'jamie@example.com',
  attempted_at: '2026-08-17T12:00:00Z',
  status_updated_at: null,
  delivery_status: 'failed',
  failure_summary: 'The email could not be sent.',
};

describe('EmailDeliveryHistory', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('renders truthful failure status and the existing recovery link', async () => {
    mockFetch.mockResolvedValue({ rows: [row], nextCursor: null });
    render(<EmailDeliveryHistory showId="show-1" />);

    expect(await screen.findByText('Needs attention')).toBeInTheDocument();
    expect(screen.getByText('Jamie Handler (jamie@example.com)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review this email' })).toHaveAttribute(
      'href',
      '/shows/show-1/entry-management'
    );
  });

  it('keeps the query isolated and supports cursor pagination', async () => {
    mockFetch
      .mockResolvedValueOnce({
        rows: [{ ...row, delivery_status: 'sent', id: 'attempt-1' }],
        nextCursor: { createdAt: row.attempted_at, id: row.id },
      })
      .mockResolvedValueOnce({ rows: [{ ...row, id: 'attempt-2' }], nextCursor: null });
    const { user } = render(<EmailDeliveryHistory showId="show-1" />);

    expect(await screen.findByText('Sent — awaiting delivery confirmation')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show more' }));
    await waitFor(() => expect(screen.getAllByTestId('delivery-history-row')).toHaveLength(2));
    expect(mockFetch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        showId: 'show-1',
        cursor: { createdAt: row.attempted_at, id: row.id },
      })
    );
  });

  it('uses plain-language empty and isolated error states', async () => {
    mockFetch.mockResolvedValue({ rows: [], nextCursor: null });
    const { rerender } = render(<EmailDeliveryHistory showId="show-1" />);
    expect(await screen.findByText('No show emails have been sent yet.')).toBeInTheDocument();

    mockFetch.mockRejectedValue(new Error('forbidden'));
    rerender(<EmailDeliveryHistory showId="show-2" />);
    expect(
      await screen.findByText('Email delivery history isn’t available right now. Try again.')
    ).toBeInTheDocument();
    expect(screen.getByText('Delivery history')).toBeInTheDocument();
  });
});
