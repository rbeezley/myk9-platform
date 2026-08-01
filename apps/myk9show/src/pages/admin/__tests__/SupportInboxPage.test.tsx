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
    expect(screen.getAllByText('/at-show/show-1').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /Open reported page/i })).toHaveAttribute(
      'href',
      '/at-show/show-1'
    );
    expect(screen.getByRole('link', { name: /Open sync monitoring/i })).toHaveAttribute(
      'href',
      '/admin/sync'
    );
    expect(screen.getByRole('link', { name: /Open user access/i })).toHaveAttribute(
      'href',
      '/admin/users?userId=owner-1'
    );
    expect(screen.getByText('Next checks')).toBeInTheDocument();
  });

  it('updates status from the detail controls', async () => {
    const { user } = render(<SupportInboxPage />, {
      initialRoute: '/admin/support?status=all&ticketId=ticket-1',
    });

    await user.click(screen.getByRole('button', { name: /^Resolved$/ }));

    expect(mockMutate).toHaveBeenCalledWith('resolved');
  });

  it('shows a diagnostics empty state and copy action when no direct route exists', () => {
    hookState.tickets = [
      makeTicket({
        diagnostics: {
          ...makeTicket().diagnostics,
          route: null,
          context: { showId: null, trialId: null, entryId: null },
          user: { authUserId: null, databaseUserId: null, role: null },
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
        showId: null,
        subject: 'General question',
      }),
    ];

    render(<SupportInboxPage />, { initialRoute: '/admin/support?status=all&ticketId=ticket-1' });

    expect(screen.getByText(/No direct route was captured/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Copy ticket link/i })).toHaveAttribute(
      'href',
      '/admin/support?ticketId=ticket-1'
    );
  });
});
