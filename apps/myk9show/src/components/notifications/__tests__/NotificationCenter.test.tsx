import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NotificationCenter } from '../NotificationCenter';
import { useNotificationStore } from '@/store/notificationStore';
import { DEFAULT_PREFERENCES } from '@myk9/notifications';
import type { NotificationPayload } from '@myk9/notifications';

vi.mock('@/store/announcementStore', async () => {
  const { create } = await import('zustand');
  const useAnnouncementStore = create<Record<string, unknown>>()(() => ({
    announcements: [],
    unreadCount: 0,
    markRead: vi.fn(),
    markAllRead: vi.fn(),
  }));
  return { useAnnouncementStore };
});

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    userWithRoles: {
      id: 'user-1',
      email: 'test@test.com',
      roles: ['secretary'],
      scopes: [],
      user_metadata: { full_name: 'Test User' },
    },
  }),
}));

// Mock AnnouncementItem and CreateAnnouncementDialog to avoid deep dependency chains
vi.mock('@/components/announcements/AnnouncementItem', () => ({
  AnnouncementItem: ({ announcement }: { announcement: { title: string } }) => (
    <div data-testid="announcement-item">{announcement.title}</div>
  ),
}));

vi.mock('@/components/announcements/CreateAnnouncementDialog', () => ({
  CreateAnnouncementDialog: () => <div data-testid="create-announcement-dialog" />,
}));

function makePayload(
  id: string,
  type: NotificationPayload['type'] = 'your_turn',
  priority: NotificationPayload['priority'] = 'normal'
): NotificationPayload {
  return {
    id,
    type,
    title: `Alert ${id}`,
    body: `Body ${id}`,
    priority,
    timestamp: Date.now(),
    actionUrl: '/test',
  };
}

function renderCenter() {
  return render(
    <MemoryRouter>
      <NotificationCenter />
    </MemoryRouter>
  );
}

beforeEach(async () => {
  useNotificationStore.setState({
    preferences: { ...DEFAULT_PREFERENCES },
    isInRing: false,
    recentAlerts: [],
    unreadCount: 0,
    isCenterOpen: true,
    permissionStatus: 'default' as NotificationPermission,
  });

  // Reset announcement store to empty state
  const { useAnnouncementStore: annStore } = await import('@/store/announcementStore');
  (annStore as unknown as { setState: (s: Record<string, unknown>) => void }).setState({
    announcements: [],
    unreadCount: 0,
  });
});

describe('NotificationCenter', () => {
  it('renders nothing when isCenterOpen is false', () => {
    useNotificationStore.setState({ isCenterOpen: false });
    const { container } = renderCenter();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('renders panel when isCenterOpen is true', () => {
    renderCenter();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Notifications')).toBeInTheDocument();
  });

  it('shows empty state when no notifications', () => {
    renderCenter();
    expect(screen.getByText(/no notifications/i)).toBeInTheDocument();
  });

  it('renders notification items', () => {
    useNotificationStore.getState().addAlert(makePayload('1'));
    useNotificationStore.getState().addAlert(makePayload('2'));
    renderCenter();

    expect(screen.getByText('Alert 1')).toBeInTheDocument();
    expect(screen.getByText('Alert 2')).toBeInTheDocument();
  });

  it('shows unread count in header', () => {
    useNotificationStore.getState().addAlert(makePayload('1'));
    useNotificationStore.getState().addAlert(makePayload('2'));
    renderCenter();

    expect(screen.getByText('2 unread')).toBeInTheDocument();
  });

  it('closes when close button clicked', () => {
    renderCenter();
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(useNotificationStore.getState().isCenterOpen).toBe(false);
  });

  it('closes when backdrop clicked', () => {
    renderCenter();
    fireEvent.click(screen.getByTestId('notification-backdrop'));
    expect(useNotificationStore.getState().isCenterOpen).toBe(false);
  });

  it('closes on Escape key', () => {
    renderCenter();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(useNotificationStore.getState().isCenterOpen).toBe(false);
  });

  it('marks all read when button clicked', () => {
    useNotificationStore.getState().addAlert(makePayload('1'));
    useNotificationStore.getState().addAlert(makePayload('2'));
    renderCenter();

    fireEvent.click(screen.getByText(/mark all read/i));
    expect(useNotificationStore.getState().unreadCount).toBe(0);
  });

  it('marks single item read when View clicked', () => {
    useNotificationStore.getState().addAlert(makePayload('1'));
    renderCenter();

    const viewBtn = screen.getByRole('link', { name: /view/i });
    fireEvent.click(viewBtn);

    expect(useNotificationStore.getState().recentAlerts[0].read).toBe(true);
  });

  it('filters by Dogs tab', () => {
    useNotificationStore.getState().addAlert(makePayload('1', 'your_turn'));
    useNotificationStore.getState().addAlert(makePayload('2', 'announcement'));
    renderCenter();

    fireEvent.click(screen.getByRole('tab', { name: /dogs/i }));

    expect(screen.getByText('Alert 1')).toBeInTheDocument();
    expect(screen.queryByText('Alert 2')).not.toBeInTheDocument();
  });

  it('filters by Announcements tab (hides alert-type items, shows store announcements)', async () => {
    useNotificationStore.getState().addAlert(makePayload('1', 'your_turn'));

    const { useAnnouncementStore: annStore } = await import('@/store/announcementStore');
    (annStore as unknown as { setState: (s: Record<string, unknown>) => void }).setState({
      announcements: [
        {
          id: 'ann-1',
          show_id: 'show-1',
          author_id: 'other-user',
          author_role: 'secretary',
          author_name: 'Admin',
          title: 'Store Announcement',
          content: 'Content here',
          priority: 'normal',
          expires_at: null,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          is_read: false,
        },
      ],
      unreadCount: 1,
    });

    renderCenter();
    fireEvent.click(screen.getByRole('tab', { name: /announcements/i }));

    expect(screen.queryByText('Alert 1')).not.toBeInTheDocument();
    expect(screen.getByText('Store Announcement')).toBeInTheDocument();
  });

  it('filters by unread only toggle', () => {
    useNotificationStore.getState().addAlert(makePayload('1'));
    useNotificationStore.getState().addAlert(makePayload('2'));
    useNotificationStore.getState().markRead('1');
    renderCenter();

    fireEvent.click(screen.getByRole('checkbox', { name: /unread only/i }));

    expect(screen.queryByText('Alert 1')).not.toBeInTheDocument();
    expect(screen.getByText('Alert 2')).toBeInTheDocument();
  });

  it('dismisses individual notification', () => {
    useNotificationStore.getState().addAlert(makePayload('1'));
    renderCenter();

    fireEvent.click(screen.getByRole('button', { name: /dismiss.*1/i }));
    expect(useNotificationStore.getState().recentAlerts).toHaveLength(0);
  });

  it('renders announcements from announcement store on Announcements tab', async () => {
    const { useAnnouncementStore: annStore } = await import('@/store/announcementStore');
    (annStore as unknown as { setState: (s: Record<string, unknown>) => void }).setState({
      announcements: [
        {
          id: 'ann-1',
          show_id: 'show-1',
          author_id: 'other-user',
          author_role: 'secretary',
          author_name: 'Admin',
          title: 'Gate Moved',
          content: 'Gate 3 moved to Ring B',
          priority: 'normal',
          expires_at: null,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          is_read: false,
        },
      ],
      unreadCount: 1,
    });

    renderCenter();
    fireEvent.click(screen.getByRole('tab', { name: /announcements/i }));

    expect(screen.getByText('Gate Moved')).toBeInTheDocument();
  });

  it('shows combined unread count in header', async () => {
    useNotificationStore.getState().addAlert(makePayload('1'));
    const { useAnnouncementStore: annStore } = await import('@/store/announcementStore');
    (annStore as unknown as { setState: (s: Record<string, unknown>) => void }).setState({
      announcements: [],
      unreadCount: 2,
    });

    renderCenter();
    expect(screen.getByText('3 unread')).toBeInTheDocument();
  });
});
