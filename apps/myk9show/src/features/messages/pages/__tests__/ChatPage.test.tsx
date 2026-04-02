import { describe, it, expect, vi } from 'vitest';
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
  fetchMessages: vi.fn(),
  sendMessage: vi.fn(),
  markThreadRead: vi.fn(),
  getOrCreateThread: vi.fn().mockResolvedValue({ id: 'thread-1' }),
  setCurrentUserId: vi.fn(),
  addMessage: vi.fn(),
  recalculateUnread: vi.fn(),
  fetchThreads: vi.fn(),
  reset: vi.fn(),
};

vi.mock('@/store/messageStore', () => ({
  useMessageStore: vi.fn((selector: (state: typeof mockStoreState) => unknown) => (selector ? selector(mockStoreState) : mockStoreState)),
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
  it('renders the message list', () => {
    render(<ChatPage />);
    expect(screen.getByText('Your paperwork is missing')).toBeInTheDocument();
  });

  it('renders the message input', () => {
    render(<ChatPage />);
    expect(screen.getByPlaceholderText(/message/i)).toBeInTheDocument();
  });
});
