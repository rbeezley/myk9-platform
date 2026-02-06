/**
 * Audio Warning System Hook
 *
 * Provides audio feedback for timer warnings and state changes in the
 * result entry system. Supports configurable alert sounds with proper
 * mobile device handling.
 */

import { useCallback, useRef, useEffect } from 'react';

import type { AudioSettings } from '@/constants/audioSettings';
import {
  SOUND_PATTERNS,
  getAudioContextClass,
  isAudioSupported,
  setupUserInteractionListeners,
} from '@/hooks/audioWarningHelpers';

/**
 * Hook for managing audio warnings and feedback
 *
 * @example
 * ```tsx
 * const audio = useAudioWarnings({
 *   warningSound: true,
 *   timeExpiredSound: true,
 *   volume: 0.8,
 *   soundType: 'chime'
 * });
 * ```
 */
export function useAudioWarnings(settings: AudioSettings) {
  const config = settings;
  const audioContextRef = useRef<AudioContext | null>(null);
  const isInitializedRef = useRef(false);

  // Initialize audio context on first user interaction
  const initializeAudio = useCallback(async () => {
    if (isInitializedRef.current || typeof window === 'undefined') return;

    try {
      const AudioCtx = getAudioContextClass();
      if (!AudioCtx) return;

      audioContextRef.current = new AudioCtx();

      if (audioContextRef.current?.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      isInitializedRef.current = true;
    } catch {
      // Audio initialization failed — continue without audio
    }
  }, []);

  // Play a tone with specified frequency and duration
  const playTone = useCallback(async (frequency: number, duration: number, type: OscillatorType = 'sine') => {
    if (!config.volume || config.volume === 0) return;

    try {
      await initializeAudio();
      const context = audioContextRef.current;
      if (!context) return;

      const oscillator = context.createOscillator();
      const gainNode = context.createGain();

      oscillator.frequency.setValueAtTime(frequency, context.currentTime);
      oscillator.type = type;

      gainNode.gain.setValueAtTime(0, context.currentTime);
      gainNode.gain.linearRampToValueAtTime(config.volume, context.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);

      oscillator.connect(gainNode);
      gainNode.connect(context.destination);

      oscillator.start(context.currentTime);
      oscillator.stop(context.currentTime + duration);
    } catch {
      // Tone playback failed — continue silently
    }
  }, [config.volume, initializeAudio]);

  // Play a pattern of tones by name
  const playPattern = useCallback(async (category: string) => {
    const pattern = SOUND_PATTERNS[category]?.[config.soundType];
    if (!pattern) return;

    for (const tone of pattern) {
      if (tone.delay === 0) {
        await playTone(tone.freq, tone.duration, tone.type);
      } else {
        setTimeout(() => playTone(tone.freq, tone.duration, tone.type), tone.delay);
      }
    }
  }, [config.soundType, playTone]);

  const playWarning = useCallback(async () => {
    if (!config.warningSound) return;
    await playPattern('warning');
  }, [config.warningSound, playPattern]);

  const playTimeExpired = useCallback(async () => {
    if (!config.timeExpiredSound) return;
    await playPattern('expired');
  }, [config.timeExpiredSound, playPattern]);

  const playStart = useCallback(async () => {
    if (!config.startSound) return;
    await playTone(600, 0.1);
  }, [config.startSound, playTone]);

  const playStop = useCallback(async () => {
    if (!config.stopSound) return;
    await playTone(400, 0.15, 'square');
  }, [config.stopSound, playTone]);

  const playTestSound = useCallback(async () => {
    await playTone(659, 0.3, 'sine');
  }, [playTone]);

  // Cleanup audio context on unmount
  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
        isInitializedRef.current = false;
      }
    };
  }, []);

  // Initialize on first user interaction
  useEffect(() => {
    return setupUserInteractionListeners(initializeAudio);
  }, [initializeAudio]);

  return {
    playWarning,
    playTimeExpired,
    playStart,
    playStop,
    playTestSound,
    isAudioSupported: isAudioSupported(),
  };
}

// Re-export for convenience
import { useCountdownTimer } from './useCountdownTimer';
export { useCountdownTimer };
