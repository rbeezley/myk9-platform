import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { screen, fireEvent } from '@testing-library/react';
import { NotificationBell } from '../NotificationBell';
import { useNotificationStore } from '@/store/notificationStore';
import { DEFAULT_PREFERENCES } from '@myk9/notifications';
import type { NotificationPayload } from '@myk9/notifications';

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    userWithRoles: {
      id: 'user-1',
      email: 'test@test.com',
      roles: ['exhibitor'],
      scopes: [],
      user_metadata: { full_name: 'Test User' },
    },
  }),
}));

vi.mock('@/store/announcementStore', async () => {
  const { create } = await import('zustand');
  const useAnnouncementStore = create<Record<string, unknown>>()(() => ({
    announcements: [],
    unreadCount: 0,
  }));
  return { useAnnouncementStore };
});

vi.mock('@/store/messageStore', async () => {
  const { create } = await import('zustand');
  const useMessageStore = create<Record<string, unknown>>()(() => ({
    unreadCount: 0,
  }));
  return { useMessageStore };
});

function makePayload(
  id: string,
  type: NotificationPayload['type'] = 'your_turn'
): NotificationPayload {
  return {
    id,
    type,
    title: `Alert ${id}`,
    body: `Body for ${id}`,
    priority: 'normal',
    timestamp: Date.now(),
  };
}

beforeEach(async () => {
  useNotificationStore.setState({
    preferences: { ...DEFAULT_PREFERENCES },
    isInRing: false,
    recentAlerts: [],
    unreadCount: 0,
    isCenterOpen: false,
    permissionStatus: 'default' as NotificationPermission,
  });

  // Reset announcement store
  const { useAnnouncementStore: annStore } = await import('@/store/announcementStore');
  (annStore as unknown as { setState: (s: Record<string, unknown>) => void }).setState({
    announcements: [],
    unreadCount: 0,
  });
  const { useMessageStore } = await import('@/store/messageStore');
  (useMessageStore as unknown as { setState: (s: Record<string, unknown>) => void }).setState({
    unreadCount: 0,
  });
});

describe('NotificationBell', () => {
  it('renders bell icon', () => {
    render(<NotificationBell />);
    expect(screen.getByRole('button', { name: /message center/i })).toBeInTheDocument();
  });

  it('shows unread badge when there are unread alerts', () => {
    useNotificationStore.getState().addAlert(makePayload('1'));
    useNotificationStore.getState().addAlert(makePayload('2'));

    render(<NotificationBell />);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('hides badge when no unread alerts', () => {
    render(<NotificationBell />);
    expect(screen.queryByText(/^\d+$/)).not.toBeInTheDocument();
  });

  it('opens Message Center on click instead of rendering a compact dropdown', () => {
    useNotificationStore.getState().addAlert(makePayload('1'));

    render(<NotificationBell />);
    fireEvent.click(screen.getByRole('button', { name: /message center/i }));

    expect(useNotificationStore.getState().isCenterOpen).toBe(true);
    expect(screen.queryByText('Alert 1')).not.toBeInTheDocument();
  });

  it('shows combined unread count from notifications, announcements, and messages', async () => {
    useNotificationStore.getState().addAlert(makePayload('1'));
    const { useAnnouncementStore: annStore } = await import('@/store/announcementStore');
    (annStore as unknown as { setState: (s: Record<string, unknown>) => void }).setState({
      unreadCount: 3,
    });
    const { useMessageStore } = await import('@/store/messageStore');
    (useMessageStore as unknown as { setState: (s: Record<string, unknown>) => void }).setState({
      unreadCount: 2,
    });

    render(<NotificationBell />);
    expect(screen.getByText('6')).toBeInTheDocument();
  });
});
