import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import SecretaryMessagesPage from '../SecretaryMessagesPage';

const mockStoreState = {
  threads: [
    {
      id: 'thread-1',
      show_id: 'show-1',
      participant_id: 'user-1',
      last_message_at: '2026-04-01T10:00:00Z',
      created_at: '2026-04-01T09:00:00Z',
      participant_name: 'Alice Handler',
      participant_role: 'Exhibitor',
      unread_count: 2,
      last_message_preview: 'Can I switch my run?',
    },
  ],
  messagesByThread: {
    'thread-1': [
      {
        id: 'msg-1',
        show_id: 'show-1',
        thread_id: 'thread-1',
        sender_id: 'user-1',
        body: 'Can I switch my run?',
        group_label: null,
        read_at: null,
        created_at: '2026-04-01T10:00:00Z',
        sender_name: 'Alice Handler',
        sender_role: 'Exhibitor',
      },
    ],
  },
  unreadCount: 2,
  isLoading: false,
  currentUserId: 'secretary-1',
  error: null,
  currentShowIds: ['show-1'],
  channels: [],
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  fetchMessages: vi.fn(),
  sendMessage: vi.fn(),
  markThreadRead: vi.fn(),
  setCurrentUserId: vi.fn(),
  getOrCreateThread: vi.fn(),
  addMessage: vi.fn(),
  recalculateUnread: vi.fn(),
  fetchThreads: vi.fn(),
  reset: vi.fn(),
};

vi.mock('@/store/messageStore', () => ({
  useMessageStore: vi.fn(
    (selector: (state: typeof mockStoreState) => unknown) =>
      selector ? selector(mockStoreState) : mockStoreState,
  ),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'secretary-1' },
    isSecretary: true,
    isAdmin: false,
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

vi.mock('@/lib/supabase-client', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      then: vi.fn().mockResolvedValue({ data: [], count: 0, error: null }),
    }),
  },
}));

describe('SecretaryMessagesPage', () => {
  it('renders the thread list', () => {
    render(<SecretaryMessagesPage />);
    expect(screen.getByText('Alice Handler')).toBeInTheDocument();
    expect(screen.getByText('Can I switch my run?')).toBeInTheDocument();
  });

  it('renders new targeted message button', () => {
    render(<SecretaryMessagesPage />);
    expect(screen.getByRole('button', { name: /message class/i })).toBeInTheDocument();
  });

  it('shows empty state when no thread is selected', () => {
    render(<SecretaryMessagesPage />);
    expect(screen.getByText(/select a conversation/i)).toBeInTheDocument();
  });
});
