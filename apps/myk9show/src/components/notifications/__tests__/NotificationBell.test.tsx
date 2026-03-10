import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NotificationBell } from '../NotificationBell';
import { useNotificationStore } from '@/store/notificationStore';
import { DEFAULT_PREFERENCES } from '@myk9/notifications';
import type { NotificationPayload } from '@myk9/notifications';

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

beforeEach(() => {
  useNotificationStore.setState({
    preferences: { ...DEFAULT_PREFERENCES },
    isInRing: false,
    recentAlerts: [],
    unreadCount: 0,
    permissionStatus: 'default' as NotificationPermission,
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

  it('marks all read when button clicked', () => {
    useNotificationStore.getState().addAlert(makePayload('1'));

    render(<NotificationBell />);
    fireEvent.click(screen.getByRole('button', { name: /notification/i }));
    fireEvent.click(screen.getByText(/mark all read/i));

    expect(useNotificationStore.getState().unreadCount).toBe(0);
  });
});
