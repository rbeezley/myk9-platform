import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
});

describe('NotificationBell', () => {
  it('renders bell icon', () => {
    render(<NotificationBell />);
    expect(screen.getByRole('button', { name: /notification/i })).toBeInTheDocument();
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

  it('opens dropdown on click', () => {
    useNotificationStore.getState().addAlert(makePayload('1'));

    render(<NotificationBell />);
    fireEvent.click(screen.getByRole('button', { name: /notification/i }));

    expect(screen.getByText('Alert 1')).toBeInTheDocument();
  });

  it('shows empty state when no alerts', () => {
    render(<NotificationBell />);
    fireEvent.click(screen.getByRole('button', { name: /notification/i }));

    expect(screen.getByText(/no notifications/i)).toBeInTheDocument();
  });

  it('opens NotificationCenter when "View all" clicked', () => {
    useNotificationStore.getState().addAlert(makePayload('1'));

    render(<NotificationBell />);
    fireEvent.click(screen.getByRole('button', { name: /notification/i }));
    const viewAllButtons = screen.getAllByText(/view all/i);
    fireEvent.click(viewAllButtons[0]);

    expect(useNotificationStore.getState().isCenterOpen).toBe(true);
  });

  it('marks all read when button clicked', () => {
    useNotificationStore.getState().addAlert(makePayload('1'));

    render(<NotificationBell />);
    fireEvent.click(screen.getByRole('button', { name: /notification/i }));
    fireEvent.click(screen.getByText(/mark all read/i));

    expect(useNotificationStore.getState().unreadCount).toBe(0);
  });

  it('shows combined unread count from both stores', async () => {
    useNotificationStore.getState().addAlert(makePayload('1'));
    const { useAnnouncementStore: annStore } = await import('@/store/announcementStore');
    (annStore as unknown as { setState: (s: Record<string, unknown>) => void }).setState({
      unreadCount: 3,
    });

    render(<NotificationBell />);
    expect(screen.getByText('4')).toBeInTheDocument();
  });
});
