// Pure helper functions for useAudioWarnings

type ToneSpec = { freq: number; duration: number; delay: number; type?: OscillatorType };

/**
 * Lookup-based sound patterns — replaces duplicate switch statements.
 * Each pattern is an array of tone specs played in sequence.
 */
export const SOUND_PATTERNS: Record<string, Record<string, ToneSpec[]>> = {
  warning: {
    beep:  [{ freq: 800, duration: 0.2, delay: 0 }],
    chime: [{ freq: 523, duration: 0.15, delay: 0 }, { freq: 659, duration: 0.15, delay: 100 }],
    tone:  [{ freq: 700, duration: 0.1, delay: 0 }, { freq: 700, duration: 0.1, delay: 150 }],
  },
  expired: {
    beep:  [{ freq: 1000, duration: 0.15, delay: 0 }, { freq: 1000, duration: 0.15, delay: 200 }, { freq: 1000, duration: 0.15, delay: 400 }],
    chime: [{ freq: 659, duration: 0.2, delay: 0 }, { freq: 523, duration: 0.2, delay: 150 }, { freq: 415, duration: 0.3, delay: 300 }],
    tone:  [{ freq: 900, duration: 0.5, delay: 0 }],
  },
};

/**
 * Returns the AudioContext constructor, handling vendor prefixes.
 */
export function getAudioContextClass(): typeof AudioContext | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

/**
 * Checks whether the current environment supports the Web Audio API.
 */
export function isAudioSupported(): boolean {
  return getAudioContextClass() !== undefined;
}

const INTERACTION_EVENTS = ['click', 'touchstart', 'keydown'] as const;

/**
 * Adds user-interaction event listeners that call `callback` once,
 * then clean themselves up. Returns a cleanup function.
 */
export function setupUserInteractionListeners(callback: () => void): () => void {
  const handler = () => {
    callback();
    for (const event of INTERACTION_EVENTS) {
      document.removeEventListener(event, handler);
    }
  };

  for (const event of INTERACTION_EVENTS) {
    document.addEventListener(event, handler);
  }

  return () => {
    for (const event of INTERACTION_EVENTS) {
      document.removeEventListener(event, handler);
    }
  };
}
