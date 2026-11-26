import { screen } from '@testing-library/react';
import { onlineManager } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { ExhibitorEmailHistory } from './ExhibitorEmailHistory';
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

const base = {
  show_id: 'show-1',
  lifecycle_step_type: null,
  related_id: null,
  recipient_name: 'Jamie Handler',
  recipient_email: 'jamie@example.com',
  status_updated_at: null,
  failure_summary: 'The recipient mail server rejected this email.',
};
const bounced = {
  ...base,
  id: 'log-1',
  source_kind: 'registration_confirmation',
  attempted_at: '2026-11-20T12:00:00Z',
  delivery_status: 'bounced',
};
const delivered = {
  ...base,
  id: 'log-2',
  source_kind: 'waitlist_notification',
  attempted_at: '2026-11-19T12:00:00Z',
  delivery_status: 'delivered',
  failure_summary: null,
};

describe('ExhibitorEmailHistory (MYK9-2403)', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetchContent.mockReset();
  });

  it('asks the history for this exhibitor on this show only', async () => {
    mockFetch.mockResolvedValue({ rows: [delivered], nextCursor: null });
    render(<ExhibitorEmailHistory showId="show-1" recipientEmail=" Jamie@Example.com " />);

    await screen.findByText('Waitlist notification');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.objectContaining({ showId: 'show-1', recipientEmail: 'Jamie@Example.com' })
    );
  });

  it('lists each email with its plain type, status, and a next step for a bounce', async () => {
    mockFetch.mockResolvedValue({ rows: [bounced, delivered], nextCursor: null });
    render(<ExhibitorEmailHistory showId="show-1" recipientEmail="jamie@example.com" />);

    expect(await screen.findByText('Receipt')).toBeInTheDocument();
    expect(screen.getByText('Waitlist notification')).toBeInTheDocument();
    expect(screen.getByText('Delivered')).toBeInTheDocument();
    expect(screen.getByText('Needs attention')).toBeInTheDocument();
    expect(
      screen.getByText('This didn’t arrive. The address may be wrong: check it with the exhibitor.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Review this email' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'View email' })).toHaveLength(2);
  });

  it('says what to do for a failed send and for a spam complaint', async () => {
    mockFetch.mockResolvedValue({
      rows: [
        { ...bounced, id: 'log-3', delivery_status: 'failed' },
        { ...bounced, id: 'log-4', delivery_status: 'complained' },
      ],
      nextCursor: null,
    });
    render(<ExhibitorEmailHistory showId="show-1" recipientEmail="jamie@example.com" />);

    expect(
      await screen.findByText(
        'This couldn’t be sent. Check the address with the exhibitor, then send it again.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'The exhibitor marked this as spam. Reach them another way before sending more.'
      )
    ).toBeInTheDocument();
  });

  it('opens the stored email with the existing viewer', async () => {
    mockFetch.mockResolvedValue({ rows: [delivered], nextCursor: null });
    mockFetchContent.mockResolvedValue({ subject: 'Spot opened', html: '<p>Hi</p>' });
    const { user } = render(
      <ExhibitorEmailHistory showId="show-1" recipientEmail="jamie@example.com" />
    );

    await user.click(await screen.findByRole('button', { name: 'View email' }));

    expect(await screen.findByTitle('Email preview')).toHaveAttribute('srcdoc', '<p>Hi</p>');
    expect(mockFetchContent).toHaveBeenCalledWith(expect.objectContaining({ emailLogId: 'log-2' }));
  });

  it('offers a resend only on a confirmation, and only when the form allows it', async () => {
    mockFetch.mockResolvedValue({ rows: [bounced, delivered], nextCursor: null });
    const onResend = vi.fn();
    const { user, rerender } = render(
      <ExhibitorEmailHistory
        showId="show-1"
        recipientEmail="jamie@example.com"
        resend={{ registrationId: 'reg-1', onResend, disabled: false }}
      />
    );

    const buttons = await screen.findAllByRole('button', { name: 'Resend confirmation' });
    expect(buttons).toHaveLength(1);
    await user.click(buttons[0] as HTMLElement);
    expect(onResend).toHaveBeenCalledWith('reg-1');

    rerender(
      <ExhibitorEmailHistory
        showId="show-1"
        recipientEmail="jamie@example.com"
        resend={{ registrationId: 'reg-1', onResend, disabled: true }}
      />
    );
    expect(await screen.findByRole('button', { name: 'Resend confirmation' })).toBeDisabled();

    rerender(<ExhibitorEmailHistory showId="show-1" recipientEmail="jamie@example.com" />);
    expect(screen.queryByRole('button', { name: 'Resend confirmation' })).not.toBeInTheDocument();
  });

  it('says there are none only when the server answered with none', async () => {
    mockFetch.mockResolvedValue({ rows: [], nextCursor: null });
    render(<ExhibitorEmailHistory showId="show-1" recipientEmail="jamie@example.com" />);

    expect(
      await screen.findByText('No emails sent to jamie@example.com for this show yet.')
    ).toBeInTheDocument();
  });

  it('says it needs a connection offline, never "no emails"', async () => {
    mockFetch.mockResolvedValue({ rows: [delivered], nextCursor: null });
    onlineManager.setOnline(false);
    try {
      render(<ExhibitorEmailHistory showId="show-1" recipientEmail="jamie@example.com" />);

      expect(await screen.findByText(/Delivery status needs a connection/)).toBeInTheDocument();
      expect(screen.queryByText(/No emails sent/)).not.toBeInTheDocument();
      expect(mockFetch).not.toHaveBeenCalled();
    } finally {
      onlineManager.setOnline(true);
    }
  });

  it('says it needs a connection when the read fails, with a retry', async () => {
    mockFetch.mockRejectedValue(new Error('network'));
    render(<ExhibitorEmailHistory showId="show-1" recipientEmail="jamie@example.com" />);

    expect(
      await screen.findByText('Delivery status needs a connection and isn’t available right now.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByText(/No emails sent/)).not.toBeInTheDocument();
  });

  it('does not read anything for an exhibitor with no address', () => {
    render(<ExhibitorEmailHistory showId="show-1" recipientEmail="  " />);

    expect(screen.getByText(/no email address on file/)).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
