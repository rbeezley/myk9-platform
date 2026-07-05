import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@/test/utils/testUtils';
import { render } from '@/test/utils/testUtils';
import SupportInboxPage from '../SupportInboxPage';
import type { SupportTicket } from '@/features/support/supportTickets';

const mockMutate = vi.fn();

const hookState = vi.hoisted(() => ({
  tickets: [] as SupportTicket[],
  isLoading: false,
  error: null as Error | null,
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'admin-1' } }),
}));

vi.mock('@/features/support/useSupportTickets', () => ({
  useSupportTickets: () => ({
    data: hookState.tickets,
    isLoading: hookState.isLoading,
    error: hookState.error,
  }),
  useUpdateSupportTicketStatus: () => ({
    mutate: mockMutate,
    isPending: false,
    error: null,
  }),
}));

vi.mock('@/features/support/SupportTicketThread', () => ({
  SupportTicketThread: ({ ticketId, isOperator }: { ticketId: string; isOperator?: boolean }) => (
    <div data-testid="support-thread">
      {ticketId}:{String(isOperator)}
    </div>
  ),
}));

function makeTicket(overrides: Partial<SupportTicket> = {}): SupportTicket {
  return {
    id: 'ticket-1',
    ownerId: 'owner-1',
    subject: 'Ring gate is blocked',
    status: 'open',
    isShowDayPriority: true,
    showId: 'show-1',
    createdAt: '2026-07-05T12:00:00.000Z',
    updatedAt: '2026-07-05T12:05:00.000Z',
    diagnostics: {
      user: { authUserId: 'owner-1', databaseUserId: null, role: 'secretary' },
      route: '/at-show/show-1',
      context: { showId: null, trialId: null, entryId: null },
      app: { version: '1.0.0', capturedAt: '2026-07-05T12:00:00.000Z' },
      connectivity: {
        online: false,
        replication: {
          status: 'stalled',
          lastSyncAt: null,
          queueSize: 3,
          conflictCount: 1,
          errorCount: 2,
          watermark: null,
        },
      },
      clientErrors: [{ message: 'Sync failed', source: 'replication', timestamp: 'now' }],
    },
    ...overrides,
  };
}

describe('SupportInboxPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hookState.isLoading = false;
    hookState.error = null;
    hookState.tickets = [
      makeTicket(),
      makeTicket({
        id: 'ticket-2',
        subject: 'Payment receipt question',
        status: 'waiting',
        isShowDayPriority: false,
      }),
    ];
  });

  it('renders the selected ticket thread and diagnostics for site admins', () => {
    render(<SupportInboxPage />, { initialRoute: '/admin/support?status=all&ticketId=ticket-2' });

    expect(screen.getAllByRole('heading', { name: 'Support Inbox' })).toHaveLength(2);
    expect(screen.getByText('Payment receipt question')).toBeInTheDocument();
    expect(screen.getByTestId('support-thread')).toHaveTextContent('ticket-2:true');
    expect(screen.getByText('Diagnostics')).toBeInTheDocument();
    expect(screen.getByText('/at-show/show-1')).toBeInTheDocument();
  });

  it('updates status from the detail controls', async () => {
    const { user } = render(<SupportInboxPage />, {
      initialRoute: '/admin/support?status=all&ticketId=ticket-1',
    });

    await user.click(screen.getByRole('button', { name: /^Resolved$/ }));

    expect(mockMutate).toHaveBeenCalledWith('resolved');
  });
});
