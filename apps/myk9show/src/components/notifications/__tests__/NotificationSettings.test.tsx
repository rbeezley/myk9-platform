import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NotificationSettings } from '../NotificationSettings';
import { useNotificationStore } from '@/store/notificationStore';
import { DEFAULT_PREFERENCES } from '@myk9/notifications';

// Mock sound test
vi.mock('@myk9/notifications', async () => {
  const actual = await vi.importActual('@myk9/notifications');
  return { ...actual, testSound: vi.fn() };
});

import { testSound } from '@myk9/notifications';

const mockSubscribe = vi.fn(() => Promise.resolve({ ok: true as const }));
const mockUnsubscribe = vi.fn(() => Promise.resolve());

vi.mock('@/hooks/usePushSubscription', () => ({
  usePushSubscription: vi.fn(() => ({
    subscribe: mockSubscribe,
    unsubscribe: mockUnsubscribe,
    isSupported: true,
  })),
}));

// Mock notifications lib to capture toast calls
vi.mock('@/lib/notifications', () => ({
  notifications: {
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

import { usePushSubscription } from '@/hooks/usePushSubscription';
import { notifications } from '@/lib/notifications';

const mockedUsePushSubscription = vi.mocked(usePushSubscription);

beforeEach(() => {
  vi.clearAllMocks();
  // Restore default mock implementation after clearAllMocks
  mockedUsePushSubscription.mockImplementation(() => ({
    subscribe: mockSubscribe,
    unsubscribe: mockUnsubscribe,
    isSupported: true,
  }));
  mockSubscribe.mockResolvedValue({ ok: true });
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

  it('renders push notifications toggle', () => {
    render(<NotificationSettings />);
    expect(screen.getByLabelText(/push notifications/i)).toBeInTheDocument();
  });

  it('calls subscribe when push checkbox is checked', async () => {
    render(<NotificationSettings />);
    const pushCheckbox = screen.getByLabelText(/push notifications/i);
    fireEvent.click(pushCheckbox);

    await waitFor(() => {
      expect(mockSubscribe).toHaveBeenCalledTimes(1);
    });
  });

  it('calls unsubscribe when push checkbox is unchecked', async () => {
    useNotificationStore.setState({
      preferences: { ...DEFAULT_PREFERENCES, pushEnabled: true },
    });

    render(<NotificationSettings />);
    const pushCheckbox = screen.getByLabelText(/push notifications/i);
    fireEvent.click(pushCheckbox);

    await waitFor(() => {
      expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    });
  });

  it('shows warning toast when subscribe returns permission-denied', async () => {
    mockSubscribe.mockResolvedValueOnce({ ok: false, reason: 'permission-denied' });

    render(<NotificationSettings />);
    const pushCheckbox = screen.getByLabelText(/push notifications/i);
    fireEvent.click(pushCheckbox);

    await waitFor(() => {
      expect(notifications.warning).toHaveBeenCalledWith(
        'Push notifications blocked. Check browser settings.'
      );
    });
  });

  it('shows error toast when subscribe fails for other reason', async () => {
    mockSubscribe.mockResolvedValueOnce({ ok: false, reason: 'subscribe-failed' });

    render(<NotificationSettings />);
    const pushCheckbox = screen.getByLabelText(/push notifications/i);
    fireEvent.click(pushCheckbox);

    await waitFor(() => {
      expect(notifications.error).toHaveBeenCalledWith('Failed to enable push notifications.');
    });
  });

  it('disables push checkbox when isSupported is false', () => {
    mockedUsePushSubscription.mockImplementation(() => ({
      subscribe: mockSubscribe,
      unsubscribe: mockUnsubscribe,
      isSupported: false,
    }));

    render(<NotificationSettings />);
    const pushCheckbox = screen.getByLabelText(/push notifications/i);
    expect(pushCheckbox).toBeDisabled();
  });

  it('shows "Not supported on this browser" text when isSupported is false', () => {
    mockedUsePushSubscription.mockImplementation(() => ({
      subscribe: mockSubscribe,
      unsubscribe: mockUnsubscribe,
      isSupported: false,
    }));

    render(<NotificationSettings />);
    expect(screen.getByText(/not supported on this browser/i)).toBeInTheDocument();
  });

  it('does not show "Not supported" text when isSupported is true', () => {
    render(<NotificationSettings />);
    expect(screen.queryByText(/not supported on this browser/i)).not.toBeInTheDocument();
  });
});
