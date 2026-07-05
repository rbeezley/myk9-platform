import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { SupportTicketThread } from './SupportTicketThread';

const hookState = vi.hoisted(() => ({
  markRead: vi.fn(),
  postMessage: vi.fn(),
}));

vi.mock('./useSupportTickets', () => ({
  useSupportTicketMessages: () => ({
    isLoading: false,
    error: null,
    data: [
      {
        id: 'm1',
        ticketId: 'ticket-1',
        senderId: 'user-1',
        body: 'My armband is missing.',
        isFromOperator: false,
        readAt: null,
        createdAt: '2026-07-05T01:00:00.000Z',
      },
      {
        id: 'm2',
        ticketId: 'ticket-1',
        senderId: 'admin-1',
        body: 'I am checking that now.',
        isFromOperator: true,
        readAt: null,
        createdAt: '2026-07-05T01:01:00.000Z',
      },
    ],
  }),
  useMarkSupportTicketMessagesRead: () => ({ mutate: hookState.markRead, error: null }),
  usePostSupportTicketMessage: () => ({
    mutate: hookState.postMessage,
    error: null,
    isPending: false,
  }),
}));

describe('SupportTicketThread', () => {
  beforeEach(() => {
    hookState.markRead.mockClear();
    hookState.postMessage.mockClear();
  });

  it('renders the thread, marks unread replies read, and posts a reply', async () => {
    render(<SupportTicketThread ticketId="ticket-1" currentUserId="user-1" />);

    expect(screen.getByText('My armband is missing.')).toBeInTheDocument();
    expect(screen.getByText('I am checking that now.')).toBeInTheDocument();
    await waitFor(() => expect(hookState.markRead).toHaveBeenCalled());

    await userEvent.type(screen.getByPlaceholderText('Reply'), 'Thank you');
    await userEvent.click(screen.getByRole('button', { name: 'Send reply' }));

    expect(hookState.postMessage).toHaveBeenCalledWith(
      {
        ticketId: 'ticket-1',
        senderId: 'user-1',
        body: 'Thank you',
        isFromOperator: false,
      },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
  });
});
