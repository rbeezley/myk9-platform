import { screen, waitFor } from '@testing-library/react';
import { onlineManager } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { EmailDeliveryHistory } from './EmailDeliveryHistory';
import type { EmailDeliveryHistoryPage } from './api';

const { mockFetch, mockFetchContent } = vi.hoisted(() => ({
  mockFetch: vi.fn<(...args: never[]) => Promise<EmailDeliveryHistoryPage>>(),
  mockFetchContent:
    vi.fn<(...args: never[]) => Promise<{ subject: string; html: string } | null>>(),
}));

vi.mock('./api', async importOriginal => {
  const actual = await importOriginal<typeof import('./api')>();
  return {
    ...actual,
    fetchShowEmailDeliveryHistory: mockFetch,
    fetchShowEmailContent: mockFetchContent,
  };
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
    mockFetchContent.mockReset();
  });

  it('renders truthful failure status and the existing recovery link', async () => {
    mockFetch.mockResolvedValue({ rows: [row], nextCursor: null });
    render(<EmailDeliveryHistory showId="show-1" />);

    expect(await screen.findByText('Needs attention')).toBeInTheDocument();
    expect(screen.getByText('Jamie Handler (jamie@example.com)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review this email' })).toHaveAttribute(
      'href',
      '/shows/show-1/entries'
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

  it('opens the stored email in a sandboxed iframe: no scripts, forms or same-origin access', async () => {
    mockFetch.mockResolvedValue({ rows: [row], nextCursor: null });
    mockFetchContent.mockResolvedValue({ subject: 'Entry accepted', html: '<p>Welcome</p>' });
    const { user } = render(<EmailDeliveryHistory showId="show-1" />);

    await user.click(await screen.findByRole('button', { name: 'View email' }));

    const frame = await screen.findByTitle('Email preview');
    // MYK9-2487: the only tokens are the two that let a link open an ordinary new tab.
    const sandbox = (frame.getAttribute('sandbox') ?? '').split(' ');
    expect(sandbox.sort()).toEqual(['allow-popups', 'allow-popups-to-escape-sandbox']);
    expect(frame.getAttribute('srcdoc')).toContain('<p>Welcome</p>');
    expect(frame.getAttribute('srcdoc')).toContain('<base target="_blank">');
    expect(mockFetchContent).toHaveBeenCalledWith(
      expect.objectContaining({ emailLogId: 'attempt-1' })
    );
  });

  it('reads an attempt id with no email_log row as "not kept"', async () => {
    mockFetch.mockResolvedValue({
      rows: [{ ...row, id: 'attempt-only', source_kind: 'lifecycle', related_id: 'job-1' }],
      nextCursor: null,
    });
    mockFetchContent.mockResolvedValue(null);
    const { user } = render(<EmailDeliveryHistory showId="show-1" />);

    await user.click(await screen.findByRole('button', { name: 'View email' }));

    expect(mockFetchContent).toHaveBeenCalledWith(
      expect.objectContaining({ emailLogId: 'attempt-only' })
    );
    expect(await screen.findByText(/A copy of this email was not kept\./)).toBeInTheDocument();
    expect(screen.queryByText(/don’t have access/)).not.toBeInTheDocument();
  });

  it('says so, with a retry, when the device is offline and the read is paused', async () => {
    mockFetch.mockResolvedValue({ rows: [row], nextCursor: null });
    mockFetchContent.mockResolvedValue({ subject: 'S', html: '<p>x</p>' });
    const { user } = render(<EmailDeliveryHistory showId="show-1" />);
    const viewButton = await screen.findByRole('button', { name: 'View email' });

    onlineManager.setOnline(false);
    try {
      await user.click(viewButton);

      expect(
        await screen.findByText('You’re offline. Connect to open this email.')
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
      expect(screen.queryByText('Loading email…')).not.toBeInTheDocument();
      expect(mockFetchContent).not.toHaveBeenCalled();
    } finally {
      onlineManager.setOnline(true);
    }
  });

  it('explains a permission error without offering a retry', async () => {
    mockFetch.mockResolvedValue({ rows: [row], nextCursor: null });
    mockFetchContent.mockRejectedValue(Object.assign(new Error('nope'), { code: '42501' }));
    const { user } = render(<EmailDeliveryHistory showId="show-1" />);

    await user.click(await screen.findByRole('button', { name: 'View email' }));

    expect(
      await screen.findByText('You don’t have access to this show’s emails.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('keeps the generic message and a retry for any other error', async () => {
    mockFetch.mockResolvedValue({ rows: [row], nextCursor: null });
    mockFetchContent.mockRejectedValue(new Error('boom'));
    const { user } = render(<EmailDeliveryHistory showId="show-1" />);

    await user.click(await screen.findByRole('button', { name: 'View email' }));

    expect(await screen.findByText('This email isn’t available right now.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('says plainly when no copy of the email was kept', async () => {
    mockFetch.mockResolvedValue({ rows: [row], nextCursor: null });
    mockFetchContent.mockResolvedValue(null);
    const { user } = render(<EmailDeliveryHistory showId="show-1" />);

    await user.click(await screen.findByRole('button', { name: 'View email' }));

    expect(
      await screen.findByText(
        'A copy of this email was not kept. Emails sent after November 17, 2026 can be opened here.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByTitle('Email preview')).not.toBeInTheDocument();
  });
});
