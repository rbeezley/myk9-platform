import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NotificationSettings } from '../NotificationSettings';
import { useNotificationStore } from '@/store/notificationStore';
import { DEFAULT_PREFERENCES } from '@myk9/notifications';

// Mock sound/voice modules
vi.mock('@myk9/notifications', async () => {
  const actual = await vi.importActual('@myk9/notifications');
  return {
    ...actual,
    testSound: vi.fn(),
    speakWithConfig: vi.fn(),
    isSpeechSupported: vi.fn(() => true),
  };
});

import { testSound, speakWithConfig } from '@myk9/notifications';

const mockSubscribe = vi.fn(() => Promise.resolve({ ok: true as const }));
const mockUnsubscribe = vi.fn(() => Promise.resolve({ ok: true as const }));

vi.mock('@/hooks/usePushSubscription', () => ({
  usePushSubscription: vi.fn(() => ({
    subscribe: mockSubscribe,
    unsubscribe: mockUnsubscribe,
    isSupported: true,
  })),
}));

vi.mock('@/lib/notifications', () => ({
  notifications: {
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock speechSynthesis for voice picker
const mockVoices = [
  { name: 'Samantha (Premium)', lang: 'en-US' },
  { name: 'Google US English', lang: 'en-US' },
  { name: 'Alex', lang: 'en-US' },
] as SpeechSynthesisVoice[];

Object.defineProperty(window, 'speechSynthesis', {
  value: {
    getVoices: () => mockVoices,
    speak: vi.fn(),
    cancel: vi.fn(),
    speaking: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  },
  writable: true,
});

Object.defineProperty(window, 'SpeechSynthesisUtterance', {
  value: class {
    text: string;
    lang = 'en-US';
    rate = 1;
    pitch = 1;
    volume = 1;
    voice: SpeechSynthesisVoice | null = null;
    constructor(text: string) {
      this.text = text;
    }
  },
  writable: true,
});

import { usePushSubscription } from '@/hooks/usePushSubscription';
import { notifications } from '@/lib/notifications';

const mockedUsePushSubscription = vi.mocked(usePushSubscription);

beforeEach(() => {
  vi.clearAllMocks();
  mockedUsePushSubscription.mockImplementation(() => ({
    subscribe: mockSubscribe,
    unsubscribe: mockUnsubscribe,
    isSupported: true,
  }));
  mockSubscribe.mockResolvedValue({ ok: true });
  mockUnsubscribe.mockResolvedValue({ ok: true });
  useNotificationStore.setState({
    preferences: { ...DEFAULT_PREFERENCES },
    isInRing: false,
    recentAlerts: [],
    unreadCount: 0,
    permissionStatus: 'default' as NotificationPermission,
  });
});

describe('NotificationSettings', () => {
  // --- Master toggle ---
  it('renders master toggle', () => {
    render(<NotificationSettings />);
    expect(screen.getByRole('switch', { name: /enable notifications/i })).toBeInTheDocument();
  });

  it('toggles master switch updates store', () => {
    render(<NotificationSettings />);
    fireEvent.click(screen.getByRole('switch', { name: /enable notifications/i }));
    expect(useNotificationStore.getState().preferences.enabled).toBe(false);
  });

  it('renders lead dogs slider', () => {
    render(<NotificationSettings />);
    expect(screen.getByLabelText(/dogs ahead/i)).toBeInTheDocument();
  });

  // --- Channels ---
  it('renders channel toggles (sound, vibration)', () => {
    render(<NotificationSettings />);
    expect(screen.getByRole('switch', { name: /^sound$/i })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /^vibration$/i })).toBeInTheDocument();
  });

  it('renders push as a channel with explanation', () => {
    render(<NotificationSettings />);
    expect(screen.getByRole('switch', { name: /push notifications/i })).toBeInTheDocument();
    expect(screen.getByText(/lock screen/i)).toBeInTheDocument();
  });

  it('calls subscribe when push is toggled on', async () => {
    render(<NotificationSettings />);
    fireEvent.click(screen.getByRole('switch', { name: /push notifications/i }));
    await waitFor(() => expect(mockSubscribe).toHaveBeenCalledTimes(1));
  });

  it('shows warning when push permission denied', async () => {
    mockSubscribe.mockResolvedValueOnce({ ok: false, reason: 'permission-denied' });
    render(<NotificationSettings />);
    fireEvent.click(screen.getByRole('switch', { name: /push notifications/i }));
    await waitFor(() =>
      expect(notifications.warning).toHaveBeenCalledWith(
        'Push notifications blocked. Check browser settings.'
      )
    );
  });

  // --- Voice Announcements ---
  it('renders voice announcements master toggle', () => {
    render(<NotificationSettings />);
    expect(screen.getByRole('switch', { name: /voice announcements/i })).toBeInTheDocument();
  });

  it('shows category toggles when voice is enabled', () => {
    useNotificationStore.setState({
      preferences: { ...DEFAULT_PREFERENCES, voiceEnabled: true },
    });
    render(<NotificationSettings />);
    expect(screen.getByRole('switch', { name: /run order alerts/i })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /results posted/i })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /class starting/i })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /^announcements$/i })).toBeInTheDocument();
  });

  it('hides category toggles when voice is disabled', () => {
    render(<NotificationSettings />);
    expect(screen.queryByRole('switch', { name: /run order alerts/i })).not.toBeInTheDocument();
  });

  it('toggles a voice category', () => {
    useNotificationStore.setState({
      preferences: { ...DEFAULT_PREFERENCES, voiceEnabled: true },
    });
    render(<NotificationSettings />);
    fireEvent.click(screen.getByRole('switch', { name: /run order alerts/i }));
    expect(useNotificationStore.getState().preferences.voiceCategories.runOrder).toBe(false);
  });

  it('renders voice picker with grouped options', () => {
    useNotificationStore.setState({
      preferences: { ...DEFAULT_PREFERENCES, voiceEnabled: true },
    });
    render(<NotificationSettings />);
    expect(screen.getByLabelText(/voice$/i)).toBeInTheDocument();
  });

  it('renders speed slider when voice enabled', () => {
    useNotificationStore.setState({
      preferences: { ...DEFAULT_PREFERENCES, voiceEnabled: true },
    });
    render(<NotificationSettings />);
    expect(screen.getByText('Speed')).toBeInTheDocument();
  });

  it('test voice button calls speakWithConfig', () => {
    useNotificationStore.setState({
      preferences: {
        ...DEFAULT_PREFERENCES,
        voiceEnabled: true,
        voiceName: 'Alex',
        voiceRate: 1.5,
      },
    });
    render(<NotificationSettings />);
    fireEvent.click(screen.getByRole('button', { name: /test voice/i }));
    expect(speakWithConfig).toHaveBeenCalledWith('This is a test of your selected voice.', {
      voiceName: 'Alex',
      voiceRate: 1.5,
    });
  });

  // --- Test notification ---
  it('fires test notification on button click', () => {
    render(<NotificationSettings />);
    fireEvent.click(screen.getByText(/test notification/i));
    expect(testSound).toHaveBeenCalled();
  });
});
