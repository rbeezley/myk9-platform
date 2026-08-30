import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
  error: null as string | null,
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

vi.mock('@/features/show-workbench/workbenchAnnouncementPost', () => ({
  useWorkbenchAnnouncementPost: () => ({
    postAnnouncement: vi.fn(),
  }),
}));

vi.mock('@/features/email-delivery-history', () => ({
  EmailDeliveryHistory: ({ showId }: { showId: string | null }) => (
    <div data-testid="email-delivery-history">History for {showId ?? 'no show'}</div>
  ),
}));

// The page scopes the show filter to clubs this user is secretary/admin for (F24), so
// the fixture now carries `clubId` and a matching role scope. Before that filter the
// store's shows were used raw, which is how other clubs' show names reached the filter.
vi.mock('@/store/showStore', () => ({
  useShowStore: (
    selector: (state: { shows: Array<{ id: string; name: string; clubId: string }> }) => unknown
  ) =>
    selector({
      shows: [
        { id: 'show-1', name: 'Spring Trial', clubId: 'club-1' },
        { id: 'show-2', name: 'Summer Trial', clubId: 'club-1' },
        // Another club's show, as the global store really does carry (loaded for
        // public browsing). This is the row F24 was about.
        { id: 'show-9', name: 'Rival Club Open', clubId: 'club-9' },
      ],
    }),
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    userWithRoles: {
      scopes: [{ scopeType: 'club', scopeId: 'club-1', roleId: 'secretary' }],
    },
    hasRole: (role: string) => role === 'secretary',
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
    baseStoreState.subscribe = vi.fn();
  });

  it('widens the message store subscription to ALL managed shows on mount', () => {
    // Regression test for the audit-route-liveness trap: the App-level
    // useMessageSubscription only covers exhibitorShowIds ∪ {selectedShowId},
    // which is narrower than what the "All shows" filter promises. The page
    // must subscribe its own union, otherwise the filter UI shows phantom
    // empty states for shows that were never fetched.
    renderAtUrl('/secretary/messages');
    expect(baseStoreState.subscribe).toHaveBeenCalledWith(
      expect.arrayContaining(['show-1', 'show-2'])
    );
  });

  it('does not name another club’s show in the filter', async () => {
    // F24: the filter was built straight from the global show store, which holds every
    // show the app has loaded — so a Heartland-only secretary saw MYK9-109 Load Shows
    // 1–3 by name. Message CONTENT was never exposed (RLS scopes reads to the show's
    // club, proven by supabase/tests/show_message_tenant_isolation_test.sql), but the
    // existence and names of other clubs' shows did leak.
    renderAtUrl('/secretary/messages');

    expect(screen.queryByText('Rival Club Open')).toBeNull();
    const body = document.body.textContent ?? '';
    expect(body).not.toContain('Rival Club Open');
  });

  it('does not subscribe to another club’s show', () => {
    // The page asked the server for threads on shows it cannot read. Harmless thanks to
    // RLS, but it is a request that should never be made.
    renderAtUrl('/secretary/messages');

    const subscribedIds = (baseStoreState.subscribe as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as string[];
    expect(subscribedIds).toEqual(expect.arrayContaining(['show-1', 'show-2']));
    expect(subscribedIds).not.toContain('show-9');
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

  it('frames the page as communication history', () => {
    renderAtUrl('/secretary/messages');
    expect(screen.getByRole('heading', { name: /communication history/i })).toBeInTheDocument();
  });

  it('does not expose compose because Message Center owns communication creation', () => {
    renderAtUrl('/secretary/messages');
    expect(screen.queryByRole('button', { name: /message show/i })).not.toBeInTheDocument();
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

  it('selects a valid ?threadId= from the URL', async () => {
    const fetchMessages = vi.fn().mockResolvedValue(undefined);
    const markThreadRead = vi.fn();
    mockStoreState = buildState({ fetchMessages, markThreadRead });

    renderAtUrl('/secretary/messages?showId=show-1&threadId=thread-1');

    await waitFor(() => {
      expect(fetchMessages).toHaveBeenCalledWith('thread-1');
    });
  });

  it('does not expose compose when a specific show is selected', () => {
    renderAtUrl('/secretary/messages?showId=show-1');
    expect(screen.queryByRole('button', { name: /message show/i })).not.toBeInTheDocument();
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

  it('switches to the full-width email delivery mode without changing the show scope', () => {
    renderAtUrl('/secretary/messages?showId=show-1');
    fireEvent.click(screen.getByRole('button', { name: 'Email delivery' }));

    expect(screen.getByRole('button', { name: 'Email delivery' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByTestId('email-delivery-history')).toHaveTextContent('History for show-1');
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
