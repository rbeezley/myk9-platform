import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PREFERENCES } from '@myk9/notifications';
import { useNotificationStore } from '@/store/notificationStore';

const speakWithConfig = vi.fn();
vi.mock('@myk9/notifications', async importOriginal => ({
  ...(await importOriginal<typeof import('@myk9/notifications')>()),
  speakWithConfig: (...args: unknown[]) => speakWithConfig(...args),
}));

import { remainingSecondsPhrase, speakRemainingSeconds } from './atShowVoiceAnnouncement';

function setPrefs(prefs: Partial<typeof DEFAULT_PREFERENCES>) {
  useNotificationStore.setState({ preferences: { ...DEFAULT_PREFERENCES, ...prefs } });
}

describe('speakRemainingSeconds', () => {
  beforeEach(() => {
    speakWithConfig.mockClear();
  });

  it('speaks with the saved voice and speed', () => {
    setPrefs({ voiceName: 'Samantha', voiceRate: 1.4 });
    speakRemainingSeconds(30);
    expect(speakWithConfig).toHaveBeenCalledWith(
      '30 seconds remaining',
      { voiceName: 'Samantha', voiceRate: 1.4 },
      // Priority, so a spoken notification can never cancel the warning (Codex round 2).
      { priority: true }
    );
  });

  it('speaks by default for a judge who never opened Settings', () => {
    setPrefs({});
    expect(useNotificationStore.getState().preferences.voiceEnabled).toBe(false);
    speakRemainingSeconds(30);
    expect(speakWithConfig).toHaveBeenCalledTimes(1);
  });

  it('speaks for an older persisted device that has no timer key', async () => {
    const { voiceEnabled, voiceName, voiceRate } = DEFAULT_PREFERENCES;
    localStorage.setItem(
      'myk9-notification-preferences',
      JSON.stringify({ state: { preferences: { voiceEnabled, voiceName, voiceRate } }, version: 0 })
    );
    await useNotificationStore.persist.rehydrate();
    speakRemainingSeconds(30);
    expect(speakWithConfig).toHaveBeenCalledTimes(1);
    localStorage.clear();
  });

  it('stays silent when the timer switch is off, even if push voice is on', () => {
    setPrefs({ timerVoiceEnabled: false, voiceEnabled: true, voiceName: 'Samantha' });
    speakRemainingSeconds(30);
    expect(speakWithConfig).not.toHaveBeenCalled();
  });

  it('uses the phrase Test Voice speaks', () => {
    expect(remainingSecondsPhrase(30)).toBe('30 seconds remaining');
  });
});

describe('saved voice missing on this device (real speakWithConfig)', () => {
  it('falls back to the default voice without throwing', async () => {
    const actual =
      await vi.importActual<typeof import('@myk9/notifications')>('@myk9/notifications');
    vi.useFakeTimers();
    const speak = vi.fn();
    vi.stubGlobal('speechSynthesis', {
      cancel: vi.fn(),
      speak,
      getVoices: () => [{ name: 'Other', lang: 'en-US' }],
    });
    class FakeUtterance {
      voice: unknown = null;
      rate = 0;
      constructor(public text: string) {}
    }
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);

    expect(() =>
      actual.speakWithConfig('30 seconds remaining', { voiceName: 'Gone', voiceRate: 1.3 })
    ).not.toThrow();
    vi.advanceTimersByTime(150);

    expect(speak).toHaveBeenCalledTimes(1);
    const utterance = speak.mock.calls[0][0] as FakeUtterance;
    expect(utterance.voice).toBeNull();
    expect(utterance.rate).toBe(1.3);

    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
});
