import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SecretaryMessagesPage from '../SecretaryMessagesPage';

const baseStoreState = {
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
    {
      id: 'thread-2',
      show_id: 'show-2',
      participant_id: 'user-2',
      last_message_at: '2026-04-02T10:00:00Z',
      created_at: '2026-04-02T09:00:00Z',
      participant_name: 'Bob Handler',
      participant_role: 'Exhibitor',
      unread_count: 0,
      last_message_preview: 'Thanks!',
    },
  ],
  messagesByThread: {},
  unreadCount: 2,
  isLoading: false,
  currentUserId: 'secretary-1',
  error: null,
  currentShowIds: ['show-1', 'show-2'],
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

const buildState = (overrides: Partial<typeof baseStoreState> = {}) => ({
  ...baseStoreState,
  ...overrides,
});

let mockStoreState = baseStoreState;

vi.mock('@/store/messageStore', () => ({
  useMessageStore: vi.fn((selector: (state: typeof mockStoreState) => unknown) =>
    selector ? selector(mockStoreState) : mockStoreState
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

vi.mock('@/hooks/mutations/useMessageMutations', () => ({
  useMessageMutations: () => ({
    sendMessage: vi.fn(),
    markThreadRead: vi.fn(),
    getOrCreateThread: vi.fn(),
    sendTargetedMessage: vi.fn(),
    isSending: false,
  }),
}));

vi.mock('@/store/showStore', () => ({
  useShowStore: (selector: (state: { shows: Array<{ id: string; name: string }> }) => unknown) =>
    selector({
      shows: [
        { id: 'show-1', name: 'Spring Trial' },
        { id: 'show-2', name: 'Summer Trial' },
      ],
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

function renderAtUrl(url: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/secretary/messages" element={<SecretaryMessagesPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('SecretaryMessagesPage — all-shows mode', () => {
  beforeEach(() => {
    mockStoreState = baseStoreState;
  });

  it('renders all threads across shows when no ?showId= filter is set', () => {
    renderAtUrl('/secretary/messages');
    expect(screen.getByText('Alice Handler')).toBeInTheDocument();
    expect(screen.getByText('Bob Handler')).toBeInTheDocument();
  });

  it('defaults the filter dropdown to "All shows"', () => {
    renderAtUrl('/secretary/messages');
    const select = screen.getByLabelText(/filter by show/i) as HTMLSelectElement;
    expect(select.value).toBe('all');
  });

  it('disables the "Message Class" button until a specific show is selected', () => {
    renderAtUrl('/secretary/messages');
    expect(screen.getByRole('button', { name: /message class/i })).toBeDisabled();
  });
});

describe('SecretaryMessagesPage — filtered mode', () => {
  beforeEach(() => {
    mockStoreState = baseStoreState;
  });

  it('reads ?showId= from the URL and narrows the thread list', () => {
    renderAtUrl('/secretary/messages?showId=show-1');
    expect(screen.getByText('Alice Handler')).toBeInTheDocument();
    expect(screen.queryByText('Bob Handler')).not.toBeInTheDocument();
  });

  it('enables the "Message Class" button when a specific show is selected', () => {
    renderAtUrl('/secretary/messages?showId=show-1');
    expect(screen.getByRole('button', { name: /message class/i })).not.toBeDisabled();
  });

  it('shows a "no messages in [show]" empty state with Clear filter affordance', () => {
    renderAtUrl('/secretary/messages?showId=show-999');
    expect(screen.getByText(/no messages in/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clear filter/i })).toBeInTheDocument();
  });

  it('changing the filter updates the URL via ?showId=', () => {
    renderAtUrl('/secretary/messages');
    const select = screen.getByLabelText(/filter by show/i) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'show-2' } });
    // After change, only Bob's thread is visible
    expect(screen.queryByText('Alice Handler')).not.toBeInTheDocument();
    expect(screen.getByText('Bob Handler')).toBeInTheDocument();
  });

  it('Clear filter button returns to all-shows view', () => {
    renderAtUrl('/secretary/messages?showId=show-999');
    fireEvent.click(screen.getByRole('button', { name: /clear filter/i }));
    expect(screen.getByText('Alice Handler')).toBeInTheDocument();
    expect(screen.getByText('Bob Handler')).toBeInTheDocument();
  });
});

describe('SecretaryMessagesPage — error state', () => {
  it('renders an error block with retry when message store reports an error', () => {
    mockStoreState = buildState({ error: 'Network error fetching threads' });
    renderAtUrl('/secretary/messages');
    expect(screen.getByText(/couldn't load messages/i)).toBeInTheDocument();
    expect(screen.getByText(/network error fetching threads/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});
