import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { speak, cancelSpeech, isSpeechSupported } from './voice';

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

describe('cancelSpeech', () => {
  it('calls speechSynthesis.cancel', () => {
    cancelSpeech();

    expect(mockSpeechSynthesis.cancel).toHaveBeenCalled();
  });
});
