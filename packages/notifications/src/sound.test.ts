import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NotificationPriority } from './types';

// Mock Web Audio API — use factory so each AudioContext instance shares tracked mocks
const createOscillator = vi.fn(() => ({
  type: 'sine' as OscillatorType,
  frequency: { setValueAtTime: vi.fn() },
  connect: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
}));

const createGain = vi.fn(() => ({
  gain: {
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
  },
  connect: vi.fn(),
}));

const resume = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.clearAllMocks();
  // Reset module-level audioContext singleton between tests
  vi.resetModules();
  vi.stubGlobal(
    'AudioContext',
    vi.fn(function () {
      return {
        state: 'running' as AudioContextState,
        currentTime: 0,
        destination: {},
        resume,
        createOscillator,
        createGain,
      };
    })
  );
});

describe('playNotificationSound', () => {
  it.each<NotificationPriority>(['normal', 'high', 'urgent'])(
    'creates oscillators for %s priority',
    async priority => {
      const { playNotificationSound: play } = await import('./sound');
      await play(priority);

      expect(createOscillator).toHaveBeenCalled();
      expect(createGain).toHaveBeenCalled();
    }
  );

  it('resumes suspended audio context', async () => {
    vi.resetModules();
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function () {
        return {
          state: 'suspended' as AudioContextState,
          currentTime: 0,
          destination: {},
          resume,
          createOscillator,
          createGain,
        };
      })
    );

    const { playNotificationSound: play } = await import('./sound');
    await play('normal');

    expect(resume).toHaveBeenCalled();
  });

  it('does not throw when AudioContext is unavailable', async () => {
    vi.resetModules();
    vi.stubGlobal('AudioContext', undefined);

    const { playNotificationSound: play } = await import('./sound');
    await expect(play('normal')).resolves.not.toThrow();
  });
});

describe('testSound', () => {
  it('plays a normal priority sound by default', async () => {
    const { testSound: test } = await import('./sound');
    await test();

    expect(createOscillator).toHaveBeenCalled();
  });

  it('plays specified priority', async () => {
    const { testSound: test } = await import('./sound');
    await test('urgent');

    expect(createOscillator).toHaveBeenCalled();
  });
});
