import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, screen, fireEvent } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { MessageCenterPanel } from '../MessageCenterPanel';
import { useNotificationStore } from '@/store/notificationStore';
import { DEFAULT_PREFERENCES } from '@myk9/notifications';
import { acknowledgeAccountNotifications } from '@/services/notifications/accountNotificationAcks';

const navigateMock = vi.fn();
const judgeReads = vi.hoisted(() => ({
  getActiveJudgeAssignmentShows: vi.fn(),
  subscribeToJudgeAssignmentChanges: vi.fn(() => () => {}),
}));

vi.mock('@/services/database/judges', () => judgeReads);

vi.mock('@/services/notifications/accountNotificationAcks', () => ({
  acknowledgeAccountNotifications: vi.fn(),
}));

vi.mock('@/hooks/useReplicationSync', () => ({
  useReplicationSync: () => ({
    status: { tablesStatus: { judge_assignments: 'success' } },
    syncTable: vi.fn(),
  }),
}));
const { classOptionsHookMock } = vi.hoisted(() => ({
  classOptionsHookMock: vi.fn(
    (
      _showId?: string | null,
      _options?: { enabled?: boolean }
    ): { data: unknown[] | undefined; isError?: boolean; refetch?: () => void } => ({
      data: [],
    })
  ),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('@/store/announcementStore', async () => {
  const { create } = await import('zustand');
  const useAnnouncementStore = create<Record<string, unknown>>()(() => ({
    announcements: [],
    unreadCount: 0,
    currentShowIds: [],
    markRead: vi.fn(),
    markAllRead: vi.fn(),
  }));
  return { useAnnouncementStore };
});

vi.mock('@/store/messageStore', async () => {
  const { create } = await import('zustand');
  const useMessageStore = create<Record<string, unknown>>()(() => ({
    threads: [],
    unreadCount: 0,
    isLoading: false,
    error: null,
    currentShowIds: [],
    subscribe: vi.fn(),
    markThreadRead: vi.fn(),
  }));
  return { useMessageStore };
});

vi.mock('@/store/showStore', async () => {
  const { create } = await import('zustand');
  const useShowStore = create<Record<string, unknown>>()(() => ({
    shows: [
      { id: 'show-1', name: 'Spring Trial', clubId: 'club-1' },
      { id: 'show-2', name: 'Summer Trial', clubId: 'club-1' },
    ],
  }));
  return { useShowStore };
});

vi.mock('@/features/show-workbench/MessageShowComposer', () => ({
  MessageShowComposer: ({
    showId,
    allowedRecipients,
    showWideDeliveryLane,
    onSent,
  }: {
    onSent?: () => void;
    showId: string;
    allowedRecipients?: string[];
    showWideDeliveryLane?: string;
  }) => (
    <div
      data-testid="message-show-composer"
      data-allowed-recipients={allowedRecipients?.join(',') ?? ''}
      data-show-wide-lane={showWideDeliveryLane ?? ''}
    >
      Composer for {showId}
      <button type="button" onClick={onSent}>
        Mock send
      </button>
    </div>
  ),
}));

vi.mock('@/features/messages/hooks/useMessageShowClassOptions', () => ({
  useMessageShowClassOptions: (...args: unknown[]) =>
    classOptionsHookMock(args[0] as string | null | undefined, args[1] as { enabled?: boolean }),
}));

let authContext: Record<string, unknown> = {};

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => authContext,
}));

vi.mock('@/components/announcements/AnnouncementItem', () => ({
  AnnouncementItem: ({ announcement }: { announcement: { title: string } }) => (
    <div data-testid="announcement-item">{announcement.title}</div>
  ),
}));

type StoreHandle = { setState: (s: Record<string, unknown>) => void };

function renderPanel() {
  return render(<MessageCenterPanel />, { initialRoute: '/' });
}

async function setShowMessageUnread(titles: string[]) {
  const { useAnnouncementStore } = await import('@/store/announcementStore');
  (useAnnouncementStore as unknown as StoreHandle).setState({
    announcements: titles.map((title, i) => ({
      id: `a-${i}`,
      title,
      content: 'x',
      is_read: false,
    })),
    unreadCount: titles.length,
  });
}

beforeEach(async () => {
  navigateMock.mockReset();
  vi.mocked(acknowledgeAccountNotifications).mockReset();
  judgeReads.getActiveJudgeAssignmentShows.mockReset();
  judgeReads.getActiveJudgeAssignmentShows.mockResolvedValue([]);
  classOptionsHookMock.mockReturnValue({ data: [] });
  authContext = {
    user: { id: 'user-1', email: 'test@test.com' },
    userWithRoles: { id: 'user-1', roles: ['exhibitor'], scopes: [], user_metadata: {} },
    isSecretary: false,
    isAdmin: false,
    hasRole: () => false,
  };
  useNotificationStore.setState({
    preferences: { ...DEFAULT_PREFERENCES },
    isInRing: false,
    recentAlerts: [],
    unreadCount: 0,
    isCenterOpen: true,
    permissionStatus: 'default' as NotificationPermission,
  });
  const { useAnnouncementStore } = await import('@/store/announcementStore');
  (useAnnouncementStore as unknown as StoreHandle).setState({
    announcements: [],
    unreadCount: 0,
  });
  const { useMessageStore } = await import('@/store/messageStore');
  (useMessageStore as unknown as StoreHandle).setState({ threads: [], unreadCount: 0 });
});

describe('MessageCenterPanel unread-aware tabs (MYK9-1180)', () => {
  it('opens on Show messages when only that tab has unread items', async () => {
    await setShowMessageUnread(['Parking update', 'Welcome to Scent Work Week']);
    renderPanel();

    expect(screen.getByRole('tab', { name: /Show messages/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByText('Parking update')).toBeInTheDocument();
    expect(screen.queryByText(/all caught up/i)).not.toBeInTheDocument();
  });

  it('carries per-tab unread counts in the tab name', async () => {
    await setShowMessageUnread(['Parking update', 'Welcome to Scent Work Week']);
    renderPanel();

    expect(screen.getByRole('tab', { name: 'Show messages, 2 unread' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Notifications' })).toBeInTheDocument();
  });

  it('never says all caught up on an empty tab while another tab is unread', async () => {
    await setShowMessageUnread(['Parking update']);
    renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: /Notifications/ }));

    expect(screen.getByText('No notifications yet')).toBeInTheDocument();
    expect(screen.queryByText(/all caught up/i)).not.toBeInTheDocument();
  });

  it('opens on Notifications and says all caught up when nothing is unread', () => {
    renderPanel();

    expect(screen.getByRole('tab', { name: 'Notifications' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByText("You're all caught up")).toBeInTheDocument();
  });

  it('prefers Notifications when both tabs have unread items', async () => {
    useNotificationStore.getState().addAlert({
      id: 'n1',
      type: 'your_turn',
      title: 'Alert n1',
      body: 'Body',
      priority: 'normal',
      timestamp: Date.now(),
    });
    await setShowMessageUnread(['Parking update']);
    renderPanel();

    expect(screen.getByRole('tab', { name: 'Notifications, 1 unread' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('does not jump tabs when unread items arrive while open, and re-picks on reopen', async () => {
    renderPanel();
    expect(screen.getByRole('tab', { name: 'Notifications' })).toHaveAttribute(
      'aria-selected',
      'true'
    );

    await act(async () => {
      await setShowMessageUnread(['Parking update']);
    });
    expect(screen.getByRole('tab', { name: 'Notifications' })).toHaveAttribute(
      'aria-selected',
      'true'
    );

    act(() => useNotificationStore.setState({ isCenterOpen: false }));
    act(() => useNotificationStore.setState({ isCenterOpen: true }));
    expect(screen.getByRole('tab', { name: /Show messages/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('keeps a tab the user chose during the same open', async () => {
    await setShowMessageUnread(['Parking update']);
    renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: /Notifications/ }));

    expect(screen.getByRole('tab', { name: /Notifications/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });
});
