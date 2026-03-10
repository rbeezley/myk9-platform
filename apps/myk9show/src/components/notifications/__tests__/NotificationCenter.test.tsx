import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NotificationCenter } from '../NotificationCenter';
import { useNotificationStore } from '@/store/notificationStore';
import { DEFAULT_PREFERENCES } from '@myk9/notifications';
import type { NotificationPayload } from '@myk9/notifications';

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

  it('filters by Announcements tab', () => {
    useNotificationStore.getState().addAlert(makePayload('1', 'your_turn'));
    useNotificationStore.getState().addAlert(makePayload('2', 'announcement'));
    renderCenter();

    fireEvent.click(screen.getByRole('tab', { name: /announcements/i }));

    expect(screen.queryByText('Alert 1')).not.toBeInTheDocument();
    expect(screen.getByText('Alert 2')).toBeInTheDocument();
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
});
