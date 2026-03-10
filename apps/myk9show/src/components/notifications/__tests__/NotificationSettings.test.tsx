import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NotificationSettings } from '../NotificationSettings';
import { useNotificationStore } from '@/store/notificationStore';
import { DEFAULT_PREFERENCES } from '@myk9/notifications';

// Mock sound test
vi.mock('@myk9/notifications', async () => {
  const actual = await vi.importActual('@myk9/notifications');
  return { ...actual, testSound: vi.fn() };
});

import { testSound } from '@myk9/notifications';

beforeEach(() => {
  vi.clearAllMocks();
  useNotificationStore.setState({
    preferences: { ...DEFAULT_PREFERENCES },
    isInRing: false,
    recentAlerts: [],
    unreadCount: 0,
    permissionStatus: 'default' as NotificationPermission,
  });
});

describe('NotificationSettings', () => {
  it('renders master toggle', () => {
    render(<NotificationSettings />);
    expect(screen.getByLabelText(/enable notifications/i)).toBeInTheDocument();
  });

  it('toggles master switch updates store', () => {
    render(<NotificationSettings />);
    const toggle = screen.getByLabelText(/enable notifications/i);
    fireEvent.click(toggle);

    expect(useNotificationStore.getState().preferences.enabled).toBe(false);
  });

  it('renders lead dogs slider', () => {
    render(<NotificationSettings />);
    expect(screen.getByLabelText(/dogs ahead/i)).toBeInTheDocument();
  });

  it('renders channel toggles', () => {
    render(<NotificationSettings />);
    expect(screen.getByLabelText(/sound/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/voice/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/vibration/i)).toBeInTheDocument();
  });

  it('fires test notification on button click', () => {
    render(<NotificationSettings />);
    fireEvent.click(screen.getByText(/test notification/i));

    expect(testSound).toHaveBeenCalled();
  });
});
