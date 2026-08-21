import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@/test/utils/testUtils';
import { NotificationSettings } from '../NotificationSettings';
import { useNotificationStore } from '@/store/notificationStore';
import { useSettingsStore } from '@/store/settingsStore';
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

// Mock the haptic feedback hook
vi.mock('@myk9/scoring-ui', () => ({
  useHapticFeedback: () => ({
    light: vi.fn(),
    medium: vi.fn(),
    isSupported: true,
  }),
}));

import { testSound, speakWithConfig } from '@myk9/notifications';

const mockSubscribe = vi.fn<
  () => Promise<{ ok: true } | { ok: false; reason: 'permission-denied' }>
>(() => Promise.resolve({ ok: true }));
const mockUnsubscribe = vi.fn(() => Promise.resolve({ ok: true as const }));

vi.mock('@/hooks/usePushSubscription', () => ({
  usePushSubscription: vi.fn(() => ({
    subscribe: mockSubscribe,
    unsubscribe: mockUnsubscribe,
    isSupported: true,
  })),
}));

// This component reads the signed-in account so it can mirror leadDogs /
// pushEnabled into notification_preferences for the server-side proximity
// push. These tests render bare (no AuthProvider), so the hook is mocked
// alongside the others rather than wrapping every case in providers.
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'test-user-id' } }),
}));

// The mirror itself is covered by notificationPreferenceSync.test.ts; stub it
// here so a settings-UI test never reaches for Supabase.
// Typed like mockSubscribe above so `mock.calls[0][0]` is a real argument
// rather than an index into an empty tuple (tsconfig.test.json catches that).
const mockSyncNotificationPreferences = vi.fn<
  (
    authUserId: string | null | undefined,
    preferences: { leadDogs: number; pushEnabled: boolean }
  ) => Promise<boolean>
>(() => Promise.resolve(true));
vi.mock('@/features/notifications/notificationPreferenceSync', () => ({
  syncNotificationPreferences: (
    authUserId: string | null | undefined,
    preferences: { leadDogs: number; pushEnabled: boolean }
  ) => mockSyncNotificationPreferences(authUserId, preferences),
}));

const mockLoadSmsNotificationPreference =
  vi.fn<(authUserId: string | undefined) => Promise<Record<string, unknown> | null>>();
const mockSetRingAlertsEnabled = vi.fn<
  (authUserId: string | undefined, enabled: boolean) => Promise<boolean>
>(() => Promise.resolve(true));
const mockSetSmsDeliveryEnabled = vi.fn<
  (authUserId: string | undefined, enabled: boolean) => Promise<boolean>
>(() => Promise.resolve(true));
const mockClearSmsConsent = vi.fn<
  (authUserId: string | undefined, preference: Record<string, unknown>) => Promise<boolean>
>(() => Promise.resolve(true));
const mockRequestSmsOptIn = vi.fn<
  (
    phone: string,
    source: string
  ) => Promise<{ status: 'enabled'; phone: string; optInAt: string; writeToken: string }>
>(() =>
  Promise.resolve({
    status: 'enabled' as const,
    phone: '+12105550142',
    optInAt: '2026-08-21T20:00:00.000Z',
    writeToken: '00000000-0000-4000-8000-000000000191',
  })
);

vi.mock('@/features/notifications/smsPreferenceService', () => ({
  SMS_CONSENT_TEXT_VERSION: 'sms-consent-v1',
  SMS_CONSENT_TEXT:
    'Text me when my dog is close to the ring. By checking this box I agree to receive SMS ring alerts from myK9Show at the number above. Msg & data rates may apply. Msg frequency varies. Reply STOP to cancel, HELP for help.',
  isValidSmsConsent: (
    row: { sms_phone_e164?: string | null; sms_opt_in_at?: string | null } | null,
    phone: string
  ) => Boolean(row?.sms_opt_in_at && row.sms_phone_e164 === phone),
  normalizeSmsPhone: (phone: string) =>
    phone.replace(/\D/g, '').length === 10 ? `+1${phone.replace(/\D/g, '')}` : null,
  loadSmsNotificationPreference: (authUserId: string | undefined) =>
    mockLoadSmsNotificationPreference(authUserId),
  setRingAlertsEnabled: (authUserId: string | undefined, enabled: boolean) =>
    mockSetRingAlertsEnabled(authUserId, enabled),
  setSmsDeliveryEnabled: (authUserId: string | undefined, enabled: boolean) =>
    mockSetSmsDeliveryEnabled(authUserId, enabled),
  clearSmsConsent: (authUserId: string | undefined, preference: Record<string, unknown>) =>
    mockClearSmsConsent(authUserId, preference),
  requestSmsOptIn: (phone: string, source: string) => mockRequestSmsOptIn(phone, source),
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
  mockLoadSmsNotificationPreference.mockResolvedValue(null);
  useNotificationStore.setState({
    preferences: { ...DEFAULT_PREFERENCES },
    isInRing: false,
    recentAlerts: [],
    unreadCount: 0,
    permissionStatus: 'default' as NotificationPermission,
  });
  useSettingsStore.getState().updateSettings({ hapticFeedback: true });
});

describe('NotificationSettings', () => {
  // --- Master toggle ---
  it('renders one ring-alert master toggle that says it stops both delivery options', async () => {
    render(<NotificationSettings />);
    expect(await screen.findByRole('switch', { name: /^ring alerts$/i })).toBeInTheDocument();
    expect(
      screen.getByText(/turn this off to stop both push notifications and text messages/i)
    ).toBeInTheDocument();
  });

  it('turns ring delivery off without stopping the global result-posted monitor', async () => {
    render(<NotificationSettings />);
    fireEvent.click(await screen.findByRole('switch', { name: /^ring alerts$/i }));
    await waitFor(() =>
      expect(mockSetRingAlertsEnabled).toHaveBeenCalledWith('test-user-id', false)
    );
    expect(useNotificationStore.getState().preferences.enabled).toBe(true);
  });

  it('renders canonical consent unchecked and normalizes through the opt-in service', async () => {
    render(<NotificationSettings />);
    const consent = await screen.findByRole('checkbox', {
      name: /Text me when my dog is close to the ring/i,
    });
    expect(consent).not.toBeChecked();
    expect(screen.getByText(/Reply STOP to cancel, HELP for help\./i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/mobile number/i), {
      target: { value: '(210) 555-0142' },
    });
    fireEvent.click(consent);
    fireEvent.click(screen.getByRole('button', { name: /turn on text alerts/i }));

    await waitFor(() =>
      expect(mockRequestSmsOptIn).toHaveBeenCalledWith('(210) 555-0142', 'account-settings')
    );
  });

  it('rejects an unresolvable number before the opt-in request', async () => {
    render(<NotificationSettings />);
    fireEvent.change(await screen.findByLabelText(/mobile number/i), {
      target: { value: '555-0142' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: /Text me when my dog is close/i }));
    fireEvent.click(screen.getByRole('button', { name: /turn on text alerts/i }));
    expect(await screen.findByText(/enter a valid mobile number/i)).toBeInTheDocument();
    expect(mockRequestSmsOptIn).not.toHaveBeenCalled();
  });

  it('suppresses consent for a valid same-number record and disables SMS without clearing it', async () => {
    mockLoadSmsNotificationPreference.mockResolvedValue({
      auth_user_id: 'test-user-id',
      upcoming_runs: true,
      sms_enabled: true,
      sms_phone_e164: '+12105550142',
      sms_opt_in_at: '2026-08-20T12:00:00Z',
      sms_consent_text_version: 'sms-consent-v1',
      sms_opt_in_source: 'account-settings',
      sms_opt_out_at: null,
    });
    render(<NotificationSettings />);
    const textSwitch = await screen.findByRole('switch', { name: /text message/i });
    expect(
      screen.queryByRole('checkbox', { name: /Text me when my dog/i })
    ).not.toBeInTheDocument();
    fireEvent.click(textSwitch);
    await waitFor(() =>
      expect(mockSetSmsDeliveryEnabled).toHaveBeenCalledWith('test-user-id', false)
    );
    expect(mockClearSmsConsent).not.toHaveBeenCalled();
  });

  it('clears prior consent when the number changes and requires a fresh unchecked box', async () => {
    mockLoadSmsNotificationPreference.mockResolvedValue({
      auth_user_id: 'test-user-id',
      upcoming_runs: true,
      sms_enabled: true,
      sms_phone_e164: '+12105550142',
      sms_opt_in_at: '2026-08-20T12:00:00Z',
      sms_consent_text_version: 'sms-consent-v1',
      sms_opt_in_source: 'account-settings',
      sms_opt_out_at: null,
    });
    render(<NotificationSettings />);
    const input = await screen.findByLabelText(/mobile number/i);
    fireEvent.change(input, { target: { value: '2105559999' } });
    fireEvent.blur(input);
    await waitFor(() =>
      expect(mockClearSmsConsent).toHaveBeenCalledWith(
        'test-user-id',
        expect.objectContaining({ sms_phone_e164: '+12105550142' })
      )
    );
    expect(screen.getByRole('checkbox', { name: /Text me when my dog/i })).not.toBeChecked();
  });

  it('renders lead dogs slider', () => {
    render(<NotificationSettings />);
    expect(screen.getByLabelText(/dogs ahead/i)).toBeInTheDocument();
  });

  it('mirrors the push toggle to the server so proximity push honours it', async () => {
    // Regression guard: the server-side run-proximity trigger reads
    // notification_preferences, so a preference that only ever lands in
    // localStorage silently stops applying once the PWA is closed.
    render(<NotificationSettings />);
    fireEvent.click(screen.getByRole('switch', { name: /push/i }));

    await waitFor(() => expect(mockSyncNotificationPreferences).toHaveBeenCalled());
    expect(mockSyncNotificationPreferences.mock.calls[0][0]).toBe('test-user-id');
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

  // --- Haptic feedback ---
  it('renders haptic feedback toggle', () => {
    render(<NotificationSettings />);
    expect(screen.getByRole('switch', { name: /haptic feedback/i })).toBeInTheDocument();
    expect(screen.getByText(/vibrate on touch/i)).toBeInTheDocument();
  });

  it('reads haptic feedback state from settings store', () => {
    useSettingsStore.getState().updateSettings({ hapticFeedback: false });
    render(<NotificationSettings />);
    expect(screen.getByRole('switch', { name: /haptic feedback/i })).toHaveAttribute(
      'data-state',
      'unchecked'
    );
  });

  it('writes haptic feedback state to settings store on toggle', () => {
    useSettingsStore.getState().updateSettings({ hapticFeedback: false });
    render(<NotificationSettings />);
    fireEvent.click(screen.getByRole('switch', { name: /haptic feedback/i }));
    expect(useSettingsStore.getState().settings.hapticFeedback).toBe(true);
  });

  // --- Test notification ---
  it('fires test notification on button click', () => {
    render(<NotificationSettings />);
    fireEvent.click(screen.getByText(/test notification/i));
    expect(testSound).toHaveBeenCalled();
  });
});
