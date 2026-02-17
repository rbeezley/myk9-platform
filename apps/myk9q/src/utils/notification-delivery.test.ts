/**
 * Tests for Notification Delivery Utilities
 */

import {
  playNotificationSound,
  getVibrationPattern,
  updateBadgeCount,
  getBadgeCount,
  clearBadge,
  isBadgeSupported,
  isVibrationSupported,
  isAudioSupported,
  DEFAULT_NOTIFICATION_SOUNDS,
} from './notification-delivery';

/** Navigator with Badging API for test mocking */
interface NavigatorWithBadge extends Navigator {
  setAppBadge: (contents?: number) => Promise<void>;
  clearAppBadge: () => Promise<void>;
}

/** Mock Audio element interface */
interface MockAudioElement {
  play: ReturnType<typeof vi.fn>;
  volume: number;
}

/** Typed reference to navigator for badge/vibration API mocking */
const nav = navigator as NavigatorWithBadge;

/** Typed reference to globalThis for Audio constructor mocking */
const globalRef = global as typeof globalThis & { Audio: typeof Audio };

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

// Replace global localStorage
Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

describe('notification-delivery', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();

    // Reset navigator mocks
    vi.restoreAllMocks();
  });

  describe('playNotificationSound', () => {
    it('should play default sound for normal priority', () => {
      const audioPlaySpy = vi.fn().mockResolvedValue(undefined);
      const AudioMock = vi.fn().mockImplementation(function (this: MockAudioElement) {
        this.play = audioPlaySpy;
        this.volume = 0;
      });

      globalRef.Audio = AudioMock as unknown as typeof Audio;

      playNotificationSound('normal');

      expect(AudioMock).toHaveBeenCalledWith(DEFAULT_NOTIFICATION_SOUNDS.default);
      expect(audioPlaySpy).toHaveBeenCalled();
    });

    it('should play urgent sound for urgent priority', () => {
      const audioPlaySpy = vi.fn().mockResolvedValue(undefined);
      const AudioMock = vi.fn().mockImplementation(function (this: MockAudioElement) {
        this.play = audioPlaySpy;
        this.volume = 0;
      });

      globalRef.Audio = AudioMock as unknown as typeof Audio;

      playNotificationSound('urgent');

      expect(AudioMock).toHaveBeenCalledWith(DEFAULT_NOTIFICATION_SOUNDS.urgent);
    });

    it('should use custom sounds when provided', () => {
      const customSounds = {
        default: '/custom/default.mp3',
        urgent: '/custom/urgent.mp3',
      };

      const AudioMock = vi.fn().mockImplementation(function (this: MockAudioElement) {
        this.play = vi.fn().mockResolvedValue(undefined);
        this.volume = 0;
      });

      globalRef.Audio = AudioMock as unknown as typeof Audio;

      playNotificationSound('normal', customSounds);

      expect(AudioMock).toHaveBeenCalledWith('/custom/default.mp3');
    });

    it('should set custom volume when provided', () => {
      let capturedVolume = 0;
      const AudioMock = vi.fn().mockImplementation(function (this: MockAudioElement) {
        this.play = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(this, 'volume', {
          set(val: number) {
            capturedVolume = val;
          },
        });
      });

      globalRef.Audio = AudioMock as unknown as typeof Audio;

      playNotificationSound('normal', DEFAULT_NOTIFICATION_SOUNDS, 0.7);

      expect(capturedVolume).toBe(0.7);
    });

    it('should clamp volume to 0-1 range', () => {
      let capturedVolume = 0;
      const AudioMock = vi.fn().mockImplementation(function (this: MockAudioElement) {
        this.play = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(this, 'volume', {
          set(val: number) {
            capturedVolume = val;
          },
        });
      });

      globalRef.Audio = AudioMock as unknown as typeof Audio;

      playNotificationSound('normal', DEFAULT_NOTIFICATION_SOUNDS, 1.5);
      expect(capturedVolume).toBe(1);

      playNotificationSound('normal', DEFAULT_NOTIFICATION_SOUNDS, -0.5);
      expect(capturedVolume).toBe(0);
    });

    it('should handle audio play failure gracefully', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const AudioMock = vi.fn().mockImplementation(function (this: MockAudioElement) {
        this.play = vi.fn().mockRejectedValue(new Error('Playback failed'));
        this.volume = 0;
      });

      globalRef.Audio = AudioMock as unknown as typeof Audio;

      playNotificationSound('normal');

      // Wait for promise to reject
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should not throw, just warn
      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    it('should handle Audio constructor error gracefully', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      globalRef.Audio = vi.fn().mockImplementation(() => {
        throw new Error('Audio not supported');
      }) as unknown as typeof Audio;

      playNotificationSound('normal');

      expect(consoleWarnSpy).toHaveBeenCalled();
    });
  });

  describe('getVibrationPattern', () => {
    it('should return triple pulse for urgent priority', () => {
      const pattern = getVibrationPattern('urgent');
      expect(pattern).toEqual([200, 100, 200, 100, 200]);
    });

    it('should return double pulse for high priority', () => {
      const pattern = getVibrationPattern('high');
      expect(pattern).toEqual([200, 100, 200]);
    });

    it('should return single short pulse for low priority', () => {
      const pattern = getVibrationPattern('low');
      expect(pattern).toEqual([100]);
    });

    it('should return single medium pulse for normal priority', () => {
      const pattern = getVibrationPattern('normal');
      expect(pattern).toEqual([150]);
    });

    it('should return normal pattern for unknown priority', () => {
      const pattern = getVibrationPattern('unknown');
      expect(pattern).toEqual([150]);
    });

    it('should return normal pattern when no priority provided', () => {
      const pattern = getVibrationPattern();
      expect(pattern).toEqual([150]);
    });
  });

  describe('updateBadgeCount', () => {
    it('should increment badge count', async () => {
      const setAppBadgeSpy = vi.fn().mockResolvedValue(undefined);
      nav.setAppBadge = setAppBadgeSpy;

      await updateBadgeCount(1);

      expect(setAppBadgeSpy).toHaveBeenCalledWith(1);
      expect(localStorage.getItem('notification_badge_count')).toBe('1');
    });

    it('should decrement badge count', async () => {
      const setAppBadgeSpy = vi.fn().mockResolvedValue(undefined);
      const clearAppBadgeSpy = vi.fn().mockResolvedValue(undefined);
      nav.setAppBadge = setAppBadgeSpy;
      nav.clearAppBadge = clearAppBadgeSpy;

      localStorage.setItem('notification_badge_count', '5');

      await updateBadgeCount(-2);

      expect(setAppBadgeSpy).toHaveBeenCalledWith(3);
      expect(localStorage.getItem('notification_badge_count')).toBe('3');
    });

    it('should clear badge when count reaches zero', async () => {
      const clearAppBadgeSpy = vi.fn().mockResolvedValue(undefined);
      nav.setAppBadge = vi.fn().mockResolvedValue(undefined);
      nav.clearAppBadge = clearAppBadgeSpy;

      localStorage.setItem('notification_badge_count', '1');

      await updateBadgeCount(-1);

      expect(clearAppBadgeSpy).toHaveBeenCalled();
      expect(localStorage.getItem('notification_badge_count')).toBe('0');
    });

    it('should not allow negative badge count', async () => {
      const clearAppBadgeSpy = vi.fn().mockResolvedValue(undefined);
      nav.clearAppBadge = clearAppBadgeSpy;

      await updateBadgeCount(-5);

      expect(clearAppBadgeSpy).toHaveBeenCalled();
      expect(localStorage.getItem('notification_badge_count')).toBe('0');
    });

    it('should handle missing Badge API gracefully', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      delete (nav as Partial<NavigatorWithBadge>).setAppBadge;

      await updateBadgeCount(1);

      expect(consoleWarnSpy).toHaveBeenCalledWith('Badge API not supported');
    });

    it('should handle badge update error gracefully', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      nav.setAppBadge = vi.fn().mockRejectedValue(new Error('Badge error'));

      await updateBadgeCount(1);

      expect(consoleWarnSpy).toHaveBeenCalled();
    });
  });

  describe('getBadgeCount', () => {
    it('should return stored badge count', async () => {
      localStorage.setItem('notification_badge_count', '5');

      const count = await getBadgeCount();

      expect(count).toBe(5);
    });

    it('should return 0 when no count stored', async () => {
      const count = await getBadgeCount();

      expect(count).toBe(0);
    });

    it('should handle invalid stored value', async () => {
      localStorage.setItem('notification_badge_count', 'invalid');

      const count = await getBadgeCount();

      expect(count).toBeNaN();
    });
  });

  describe('clearBadge', () => {
    it('should clear badge and reset storage', async () => {
      const clearAppBadgeSpy = vi.fn().mockResolvedValue(undefined);
      nav.clearAppBadge = clearAppBadgeSpy;

      localStorage.setItem('notification_badge_count', '5');

      await clearBadge();

      expect(clearAppBadgeSpy).toHaveBeenCalled();
      expect(localStorage.getItem('notification_badge_count')).toBe('0');
    });

    it('should handle missing Badge API gracefully', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      delete (nav as Partial<NavigatorWithBadge>).clearAppBadge;

      await clearBadge();

      expect(consoleWarnSpy).toHaveBeenCalledWith('Badge API not supported');
    });

    it('should handle clear error gracefully', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      nav.clearAppBadge = vi.fn().mockRejectedValue(new Error('Clear failed'));

      await clearBadge();

      expect(consoleWarnSpy).toHaveBeenCalled();
    });
  });

  describe('isBadgeSupported', () => {
    it('should return true when Badge API is available', () => {
      nav.setAppBadge = vi.fn();
      nav.clearAppBadge = vi.fn();

      expect(isBadgeSupported()).toBe(true);
    });

    it('should return false when setAppBadge is missing', () => {
      delete (nav as Partial<NavigatorWithBadge>).setAppBadge;
      nav.clearAppBadge = vi.fn();

      expect(isBadgeSupported()).toBe(false);
    });

    it('should return false when clearAppBadge is missing', () => {
      nav.setAppBadge = vi.fn();
      delete (nav as Partial<NavigatorWithBadge>).clearAppBadge;

      expect(isBadgeSupported()).toBe(false);
    });

    it('should return false when both APIs are missing', () => {
      delete (nav as Partial<NavigatorWithBadge>).setAppBadge;
      delete (nav as Partial<NavigatorWithBadge>).clearAppBadge;

      expect(isBadgeSupported()).toBe(false);
    });
  });

  describe('isVibrationSupported', () => {
    it('should return true when Vibration API is available', () => {
      navigator.vibrate = vi.fn();

      expect(isVibrationSupported()).toBe(true);
    });

    it('should return false when Vibration API is missing', () => {
      delete (navigator as Partial<Navigator>).vibrate;

      expect(isVibrationSupported()).toBe(false);
    });
  });

  describe('isAudioSupported', () => {
    it('should return true when Audio is available', () => {
      globalRef.Audio = vi.fn() as unknown as typeof Audio;

      expect(isAudioSupported()).toBe(true);
    });

    it('should return false when Audio is undefined', () => {
      globalRef.Audio = undefined as unknown as typeof Audio;

      expect(isAudioSupported()).toBe(false);
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle complete notification delivery flow', async () => {
      const audioPlaySpy = vi.fn().mockResolvedValue(undefined);
      const AudioMock = vi.fn().mockImplementation(function (this: MockAudioElement) {
        this.play = audioPlaySpy;
        this.volume = 0;
      });
      globalRef.Audio = AudioMock as unknown as typeof Audio;

      const setAppBadgeSpy = vi.fn().mockResolvedValue(undefined);
      nav.setAppBadge = setAppBadgeSpy;
      navigator.vibrate = vi.fn();

      // Play sound
      playNotificationSound('urgent');

      // Vibrate
      const pattern = getVibrationPattern('urgent');
      navigator.vibrate(pattern);

      // Update badge
      await updateBadgeCount(1);

      expect(audioPlaySpy).toHaveBeenCalled();
      expect(navigator.vibrate).toHaveBeenCalledWith([200, 100, 200, 100, 200]);
      expect(setAppBadgeSpy).toHaveBeenCalledWith(1);
    });

    it('should handle multiple badge increments', async () => {
      const setAppBadgeSpy = vi.fn().mockResolvedValue(undefined);
      nav.setAppBadge = setAppBadgeSpy;

      await updateBadgeCount(1);
      await updateBadgeCount(1);
      await updateBadgeCount(1);

      expect(await getBadgeCount()).toBe(3);
    });

    it('should handle badge increment then clear', async () => {
      const setAppBadgeSpy = vi.fn().mockResolvedValue(undefined);
      const clearAppBadgeSpy = vi.fn().mockResolvedValue(undefined);
      nav.setAppBadge = setAppBadgeSpy;
      nav.clearAppBadge = clearAppBadgeSpy;

      await updateBadgeCount(5);
      expect(await getBadgeCount()).toBe(5);

      await clearBadge();
      expect(await getBadgeCount()).toBe(0);
    });
  });
});
