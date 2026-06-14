import { beforeEach, describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import ChatPage from '../ChatPage';

const mockStoreState = {
  threads: [
    {
      id: 'thread-1',
      show_id: 'show-1',
      participant_id: 'user-1',
      last_message_at: '2026-04-01T10:00:00Z',
      created_at: '2026-04-01T09:00:00Z',
    },
  ],
  messagesByThread: {
    'thread-1': [
      {
        id: 'msg-1',
        show_id: 'show-1',
        thread_id: 'thread-1',
        sender_id: 'user-2',
        body: 'Your paperwork is missing',
        group_label: null,
        read_at: null,
        created_at: '2026-04-01T10:00:00Z',
        sender_name: 'Jane Secretary',
        sender_role: 'Secretary',
      },
    ],
  },
  unreadCount: 1,
  isLoading: false,
  currentUserId: 'user-1',
  error: null,
  currentShowIds: ['show-1'],
  channels: [],
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  fetchMessages: vi.fn().mockResolvedValue(undefined),
  sendMessage: vi.fn(),
  markThreadRead: vi.fn(),
  getOrCreateThread: vi.fn().mockResolvedValue({ id: 'thread-1' }),
  setCurrentUserId: vi.fn(),
  addMessage: vi.fn(),
  recalculateUnread: vi.fn(),
  fetchThreads: vi.fn().mockResolvedValue(undefined),
  reset: vi.fn(),
};

vi.mock('@/store/messageStore', () => ({
  useMessageStore: vi.fn((selector: (state: typeof mockStoreState) => unknown) =>
    selector ? selector(mockStoreState) : mockStoreState
  ),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-1' },
    loading: false,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    signInWithGoogle: vi.fn(),
    resetPassword: vi.fn(),
    updatePassword: vi.fn(),
    updateProfile: vi.fn(),
  }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useParams: () => ({ showId: 'show-1' }) };
});

vi.mock('@/hooks/mutations/useMessageMutations', () => ({
  useMessageMutations: () => ({
    sendMessage: vi.fn(),
    markThreadRead: vi.fn(),
    getOrCreateThread: vi.fn(),
    sendTargetedMessage: vi.fn(),
    isSending: false,
  }),
}));

describe('ChatPage', () => {
  const originalThreads = mockStoreState.threads;
  const originalMessagesByThread = mockStoreState.messagesByThread;

  beforeEach(() => {
    mockStoreState.threads = originalThreads;
    mockStoreState.messagesByThread = originalMessagesByThread;
    mockStoreState.fetchThreads = vi.fn().mockResolvedValue(undefined);
    mockStoreState.fetchMessages = vi.fn().mockResolvedValue(undefined);
    mockStoreState.markThreadRead = vi.fn();
    mockStoreState.getOrCreateThread = vi.fn().mockResolvedValue({ id: 'thread-1' });
  });

  it('renders the message list', () => {
    render(<ChatPage />);
    expect(screen.getByText('Your paperwork is missing')).toBeInTheDocument();
  });

  it('renders the message input', () => {
    render(<ChatPage />);
    expect(screen.getByPlaceholderText(/message/i)).toBeInTheDocument();
  });

  it('cold-load: fetches this show\'s threads on mount and shows loading (not the empty state) until hydrated', async () => {
    // Simulate a cold push-tap deep-link: the store has no threads yet, and the
    // hydration fetch populates them (which then re-renders via the page's flag).
    mockStoreState.threads = [];
    mockStoreState.fetchThreads = vi.fn().mockImplementation(async () => {
      mockStoreState.threads = originalThreads;
    });

    try {
      render(<ChatPage />);

      // Hydration is triggered for the route's showId...
      expect(mockStoreState.fetchThreads).toHaveBeenCalledWith('show-1');
      // ...and while cold we show loading, never the misleading empty state.
      expect(screen.getByText('Loading messages...')).toBeInTheDocument();
      expect(screen.queryByText('Start a conversation')).not.toBeInTheDocument();

      // Once threads hydrate, the secretary message renders.
      expect(await screen.findByText('Your paperwork is missing')).toBeInTheDocument();
    } finally {
      mockStoreState.threads = originalThreads;
    }
  });

  it('shows an exhibitor start state instead of blank content when no thread exists', async () => {
    mockStoreState.threads = [];
    mockStoreState.messagesByThread = {};

    render(<ChatPage />);

    expect(
      await screen.findByRole('heading', { name: /Message the show team/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/Ask a question about this show/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Start message/i })).toBeEnabled();
  });

  it('keeps the message route nonblank when starting a thread fails', async () => {
    mockStoreState.threads = [];
    mockStoreState.messagesByThread = {};
    mockStoreState.getOrCreateThread = vi.fn().mockResolvedValue(null);
    const { user } = render(<ChatPage />);

    await user.click(await screen.findByRole('button', { name: /Start message/i }));

    expect(await screen.findByText(/We couldn't start that message/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Message the show team/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Start message/i })).toBeEnabled();
  });
});
