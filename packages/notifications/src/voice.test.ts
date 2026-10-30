import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { speak, speakWithConfig, isSpeechSupported } from './voice';

const mockUtterance = {
  text: '',
  lang: '',
  rate: 1,
  pitch: 1,
  volume: 1,
};

const mockSpeechSynthesis = {
  speak: vi.fn(),
  cancel: vi.fn(),
  speaking: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    vi.fn(function () {
      return { ...mockUtterance };
    })
  );
  vi.stubGlobal('speechSynthesis', { ...mockSpeechSynthesis });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('isSpeechSupported', () => {
  it('returns true when SpeechSynthesis is available', () => {
    expect(isSpeechSupported()).toBe(true);
  });

  it('returns false when SpeechSynthesis is unavailable', () => {
    vi.stubGlobal('speechSynthesis', undefined);
    expect(isSpeechSupported()).toBe(false);
  });
});

describe('speak', () => {
  it('creates utterance and calls speechSynthesis.speak', () => {
    speak('Hello world');
    vi.advanceTimersByTime(100); // Chrome bug workaround delay

    expect(SpeechSynthesisUtterance).toHaveBeenCalled();
    expect(mockSpeechSynthesis.speak).toHaveBeenCalled();
  });

  it('cancels current speech before speaking', () => {
    vi.stubGlobal('speechSynthesis', { ...mockSpeechSynthesis, speaking: true });

    speak('New text');
    vi.advanceTimersByTime(100);

    expect(mockSpeechSynthesis.cancel).toHaveBeenCalled();
    expect(mockSpeechSynthesis.speak).toHaveBeenCalled();
  });

  it('does nothing when speech is not supported', () => {
    vi.stubGlobal('speechSynthesis', undefined);

    expect(() => speak('Test')).not.toThrow();
  });
});

describe('priority speech (MYK9-1510)', () => {
  const config = { voiceName: '', voiceRate: 1 };
  const spoken = () =>
    (speechSynthesis.speak as ReturnType<typeof vi.fn>).mock.calls.map(
      ([utterance]) => (utterance as { text: string }).text
    );

  beforeEach(() => {
    // The file-level stub drops the text; these tests need to see what was spoken.
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      vi.fn(function (text: string) {
        return { ...mockUtterance, text };
      })
    );
  });

  afterEach(() => {
    // The hold is module state, and each test's fake clock restarts at real time, so a time-bound
    // release cannot carry over: end every utterance that was spoken instead.
    vi.advanceTimersByTime(200);
    for (const [utterance] of (speechSynthesis.speak as ReturnType<typeof vi.fn>).mock.calls) {
      (utterance as { onend?: () => void }).onend?.();
    }
  });

  it('skips ordinary speech while a priority utterance holds the voice', () => {
    speakWithConfig('30 seconds remaining', config, { priority: true });
    vi.advanceTimersByTime(100);
    speakWithConfig('Your dog is up next', config);
    vi.advanceTimersByTime(100);
    expect(spoken()).toEqual(['30 seconds remaining']);
    expect(speechSynthesis.cancel).toHaveBeenCalledTimes(1);
  });

  it('lets ordinary speech through once the priority utterance ends', () => {
    speakWithConfig('30 seconds remaining', config, { priority: true });
    vi.advanceTimersByTime(100);
    const utterance = (speechSynthesis.speak as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      onend: () => void;
    };
    utterance.onend();
    speakWithConfig('Your dog is up next', config);
    vi.advanceTimersByTime(100);
    expect(spoken()).toEqual(['30 seconds remaining', 'Your dog is up next']);
  });

  it('releases the hold after the time bound if the end is never reported', () => {
    speakWithConfig('30 seconds remaining', config, { priority: true });
    vi.advanceTimersByTime(10_001);
    speakWithConfig('Your dog is up next', config);
    vi.advanceTimersByTime(100);
    expect(spoken()).toEqual(['30 seconds remaining', 'Your dog is up next']);
  });

  it('a priority utterance still cancels ordinary speech in progress', () => {
    speakWithConfig('Your dog is up next', config);
    vi.advanceTimersByTime(100);
    speakWithConfig('30 seconds remaining', config, { priority: true });
    vi.advanceTimersByTime(100);
    expect(spoken()).toEqual(['Your dog is up next', '30 seconds remaining']);
    expect(speechSynthesis.cancel).toHaveBeenCalledTimes(2);
  });
});
