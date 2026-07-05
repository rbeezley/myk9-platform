import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import SupportTicketPage from '../SupportTicketPage';
import type { SupportTicket } from '@/features/support/supportTickets';

const hookState = vi.hoisted(() => ({
  tickets: [] as SupportTicket[],
  isLoading: false,
  error: null as Error | null,
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'owner-1' } }),
}));

vi.mock('@/features/support/useSupportTickets', () => ({
  useSupportTickets: () => ({
    data: hookState.tickets,
    isLoading: hookState.isLoading,
    error: hookState.error,
  }),
}));

vi.mock('@/features/support/SupportTicketThread', () => ({
  SupportTicketThread: ({
    ticketId,
    currentUserId,
  }: {
    ticketId: string;
    currentUserId: string;
  }) => (
    <div data-testid="support-thread">
      {ticketId}:{currentUserId}
    </div>
  ),
}));

function makeTicket(): SupportTicket {
  return {
    id: 'ticket-1',
    ownerId: 'owner-1',
    subject: 'How do I update my entry?',
    status: 'waiting',
    isShowDayPriority: false,
    showId: null,
    createdAt: '2026-07-05T12:00:00.000Z',
    updatedAt: '2026-07-05T12:05:00.000Z',
    diagnostics: {
      user: { authUserId: 'owner-1', databaseUserId: null, role: 'exhibitor' },
      route: '/exhibitor/entries',
      context: { showId: null, trialId: null, entryId: null },
      app: { version: '1.0.0', capturedAt: '2026-07-05T12:00:00.000Z' },
      connectivity: {
        online: true,
        replication: {
          status: null,
          lastSyncAt: null,
          queueSize: null,
          conflictCount: null,
          errorCount: null,
          watermark: null,
        },
      },
      clientErrors: [],
    },
  };
}

describe('SupportTicketPage', () => {
  beforeEach(() => {
    hookState.tickets = [makeTicket()];
    hookState.isLoading = false;
    hookState.error = null;
  });

  it('renders the support ticket thread from the notification URL', () => {
    render(<SupportTicketPage />, { initialRoute: '/support?ticketId=ticket-1' });

    expect(screen.getAllByRole('heading', { name: 'Support' })).toHaveLength(2);
    expect(screen.getByText('How do I update my entry?')).toBeInTheDocument();
    expect(screen.getByTestId('support-thread')).toHaveTextContent('ticket-1:owner-1');
  });
});
