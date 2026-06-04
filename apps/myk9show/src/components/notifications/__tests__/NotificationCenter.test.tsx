import { describe, expect, it, beforeEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { NotificationCenter } from '../NotificationCenter';
import { useNotificationStore } from '@/store/notificationStore';
import { DEFAULT_PREFERENCES } from '@myk9/notifications';

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

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: { id: 'user-1', email: 'test@test.com' },
    userWithRoles: { id: 'user-1', roles: ['exhibitor'], scopes: [], user_metadata: {} },
    isSecretary: false,
    isAdmin: false,
    hasRole: () => false,
  }),
}));

vi.mock('@/components/announcements/AnnouncementItem', () => ({
  AnnouncementItem: ({ announcement }: { announcement: { title: string } }) => (
    <div data-testid="announcement-item">{announcement.title}</div>
  ),
}));

vi.mock('@/components/announcements/CreateAnnouncementDialog', () => ({
  CreateAnnouncementDialog: () => <div data-testid="create-announcement-dialog" />,
}));

function renderCenter() {
  return render(<NotificationCenter />);
}

beforeEach(() => {
  useNotificationStore.setState({
    preferences: { ...DEFAULT_PREFERENCES },
    isInRing: false,
    recentAlerts: [],
    unreadCount: 0,
    isCenterOpen: true,
    permissionStatus: 'default' as NotificationPermission,
  });
});

describe('NotificationCenter', () => {
  it('exports the Message Center compatibility wrapper', () => {
    renderCenter();
    expect(screen.getByRole('dialog', { name: /message center/i })).toBeInTheDocument();
  });
});
