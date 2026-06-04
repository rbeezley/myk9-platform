import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { MessageCenterPanel } from '../MessageCenterPanel';
import { useNotificationStore } from '@/store/notificationStore';
import { DEFAULT_PREFERENCES } from '@myk9/notifications';
import type { NotificationPayload } from '@myk9/notifications';

const navigateMock = vi.fn();

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

let authContext: Record<string, unknown> = {
  user: { id: 'user-1', email: 'test@test.com' },
  userWithRoles: { id: 'user-1', roles: ['exhibitor'], scopes: [], user_metadata: {} },
  isSecretary: false,
  isAdmin: false,
  hasRole: () => false,
};

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => authContext,
}));

vi.mock('@/components/announcements/AnnouncementItem', () => ({
  AnnouncementItem: ({ announcement }: { announcement: { title: string } }) => (
    <div data-testid="announcement-item">{announcement.title}</div>
  ),
}));

vi.mock('@/components/announcements/CreateAnnouncementDialog', () => ({
  CreateAnnouncementDialog: () => <div data-testid="create-announcement-dialog" />,
}));

function makePayload(id: string): NotificationPayload {
  return {
    id,
    type: 'your_turn',
    title: `Alert ${id}`,
    body: `Body ${id}`,
    priority: 'normal',
    timestamp: Date.now(),
    actionUrl: '/test',
  };
}

function renderPanel() {
  return render(<MessageCenterPanel />);
}

beforeEach(async () => {
  navigateMock.mockReset();
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
  (useAnnouncementStore as unknown as { setState: (s: Record<string, unknown>) => void }).setState({
    announcements: [],
    unreadCount: 0,
    currentShowIds: [],
    markRead: vi.fn(),
    markAllRead: vi.fn(),
  });
  const { useMessageStore } = await import('@/store/messageStore');
  (useMessageStore as unknown as { setState: (s: Record<string, unknown>) => void }).setState({
    threads: [],
    unreadCount: 0,
    isLoading: false,
    error: null,
    currentShowIds: [],
    subscribe: vi.fn(),
    markThreadRead: vi.fn(),
  });
});

describe('MessageCenterPanel', () => {
  it('renders a left-side Message Center dialog', () => {
    renderPanel();
    const dialog = screen.getByRole('dialog', { name: /message center/i });
    expect(dialog).toBeInTheDocument();
    expect(dialog.querySelector('.slide-over-panel')).toHaveClass('left-0');
  });

  it('orders tabs as Notifications, Announcements, Messages', () => {
    renderPanel();
    const tabs = screen.getAllByRole('tab').map(tab => tab.textContent);
    expect(tabs).toEqual(['Notifications', 'Announcements', 'Messages']);
  });

  it('defaults to the Notifications tab', () => {
    useNotificationStore.getState().addAlert(makePayload('1'));
    renderPanel();
    expect(screen.getByText('Alert 1')).toBeInTheDocument();
  });

  it('renders messages and routes exhibitors to /messages/:showId', async () => {
    const { useMessageStore } = await import('@/store/messageStore');
    (useMessageStore as unknown as { setState: (s: Record<string, unknown>) => void }).setState({
      threads: [
        {
          id: 'thread-1',
          show_id: 'show-1',
          participant_id: 'user-1',
          participant_name: 'Trial Secretary',
          show_name: 'Spring Trial',
          last_message_at: '2026-06-04T12:00:00Z',
          created_at: '2026-06-04T12:00:00Z',
          unread_count: 2,
          last_message_preview: 'Can you confirm your armband?',
        },
      ],
      unreadCount: 2,
    });

    renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: 'Messages' }));
    fireEvent.click(screen.getByRole('button', { name: /Spring Trial/i }));

    expect(navigateMock).toHaveBeenCalledWith('/messages/show-1');
    expect(useNotificationStore.getState().isCenterOpen).toBe(false);
  });

  it('routes staff users to /secretary/messages?showId=:showId', async () => {
    authContext = {
      user: { id: 'user-1', email: 'test@test.com' },
      userWithRoles: { id: 'user-1', roles: ['secretary'], scopes: [], user_metadata: {} },
      isSecretary: true,
      isAdmin: false,
      hasRole: () => false,
    };
    const { useMessageStore } = await import('@/store/messageStore');
    (useMessageStore as unknown as { setState: (s: Record<string, unknown>) => void }).setState({
      threads: [
        {
          id: 'thread-1',
          show_id: 'show-1',
          participant_id: 'user-1',
          show_name: 'Spring Trial',
          last_message_at: '2026-06-04T12:00:00Z',
          created_at: '2026-06-04T12:00:00Z',
        },
      ],
    });

    renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: 'Messages' }));
    fireEvent.click(screen.getByRole('button', { name: /Spring Trial/i }));

    expect(navigateMock).toHaveBeenCalledWith('/secretary/messages?showId=show-1');
  });

  it('renders independent empty states for every tab', () => {
    renderPanel();

    expect(screen.getByText('No notifications yet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Announcements' }));
    expect(screen.getByText('No announcements yet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Messages' }));
    expect(screen.getByText('No messages yet')).toBeInTheDocument();
  });

  it('shows a retry action when message loading fails', async () => {
    const subscribe = vi.fn();
    const { useMessageStore } = await import('@/store/messageStore');
    (useMessageStore as unknown as { setState: (s: Record<string, unknown>) => void }).setState({
      error: 'Failed to load messages',
      currentShowIds: ['show-1'],
      subscribe,
    });

    renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: 'Messages' }));
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(subscribe).toHaveBeenCalledWith(['show-1']);
  });

  it('marks unread message threads read when using the global mark-all action', async () => {
    useNotificationStore.getState().addAlert(makePayload('1'));
    const markThreadRead = vi.fn();
    const { useMessageStore } = await import('@/store/messageStore');
    (useMessageStore as unknown as { setState: (s: Record<string, unknown>) => void }).setState({
      threads: [
        {
          id: 'thread-1',
          show_id: 'show-1',
          participant_id: 'user-1',
          show_name: 'Spring Trial',
          last_message_at: '2026-06-04T12:00:00Z',
          created_at: '2026-06-04T12:00:00Z',
          unread_count: 2,
        },
        {
          id: 'thread-2',
          show_id: 'show-2',
          participant_id: 'user-1',
          show_name: 'Summer Trial',
          last_message_at: '2026-06-04T12:00:00Z',
          created_at: '2026-06-04T12:00:00Z',
          unread_count: 0,
        },
      ],
      unreadCount: 2,
      markThreadRead,
    });

    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /mark all read/i }));

    expect(markThreadRead).toHaveBeenCalledWith('thread-1');
    expect(markThreadRead).not.toHaveBeenCalledWith('thread-2');
  });
});
