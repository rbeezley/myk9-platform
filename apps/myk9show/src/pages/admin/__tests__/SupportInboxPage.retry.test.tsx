import { QueryClient } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SupportTicket } from '@/features/support/supportTickets';
import { render } from '@/test/utils/testUtils';
import SupportInboxPage from '../SupportInboxPage';

const listSupportTicketsMock = vi.hoisted(() => vi.fn());

vi.mock('@/features/support/supportTickets', async importOriginal => {
  const actual = await importOriginal<typeof import('@/features/support/supportTickets')>();
  return {
    ...actual,
    listSupportTickets: listSupportTicketsMock,
  };
});

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'admin-1' } }),
}));

vi.mock('@/features/support/SupportTicketThread', () => ({
  SupportTicketThread: ({ ticketId }: { ticketId: string }) => (
    <div data-testid="support-thread">{ticketId}</div>
  ),
}));

const recoveredTicket: SupportTicket = {
  id: 'ticket-1',
  ownerId: 'owner-1',
  subject: 'Recovered show-day ticket',
  status: 'open',
  isShowDayPriority: true,
  showId: 'show-1',
  createdAt: '2026-08-21T12:00:00.000Z',
  updatedAt: '2026-08-21T12:05:00.000Z',
  diagnostics: {
    user: { authUserId: 'owner-1', databaseUserId: null, role: 'secretary' },
    route: '/at-show/show-1',
    context: { showId: 'show-1', trialId: null, entryId: null },
    app: { version: '1.0.0', capturedAt: '2026-08-21T12:00:00.000Z' },
    connectivity: {
      online: true,
      replication: {
        status: 'idle',
        lastSyncAt: null,
        queueSize: 0,
        conflictCount: 0,
        errorCount: 0,
        watermark: null,
      },
    },
    clientErrors: [],
  },
};

describe('SupportInboxPage Retry recovery', () => {
  it('reissues an exhausted ticket query and replaces the error with current data', async () => {
    listSupportTicketsMock
      .mockRejectedValueOnce(new Error('Temporary support failure'))
      .mockRejectedValueOnce(new Error('Temporary support failure'))
      .mockRejectedValueOnce(new Error('Temporary support failure'))
      .mockRejectedValueOnce(new Error('Temporary support failure'))
      .mockResolvedValueOnce([recoveredTicket]);

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: 3,
          retryDelay: 0,
          refetchOnWindowFocus: false,
        },
      },
    });
    const { user } = render(<SupportInboxPage />, {
      initialRoute: '/admin/support?status=all',
      queryClient,
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Temporary support failure');
    expect(listSupportTicketsMock).toHaveBeenCalledTimes(4);

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(listSupportTicketsMock).toHaveBeenCalledTimes(5));
    expect(await screen.findByRole('heading', { name: 'Recovered show-day ticket' })).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open (1)' })).toBeInTheDocument();
  });
});
