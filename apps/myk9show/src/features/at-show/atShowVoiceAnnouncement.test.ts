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
    setPrefs({ voiceEnabled: true, voiceName: 'Samantha', voiceRate: 1.4 });
    speakRemainingSeconds(30);
    expect(speakWithConfig).toHaveBeenCalledWith('30 seconds remaining', {
      voiceName: 'Samantha',
      voiceRate: 1.4,
    });
  });

  it('stays silent when Settings has voice announcements off', () => {
    setPrefs({ voiceEnabled: false, voiceName: 'Samantha' });
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
