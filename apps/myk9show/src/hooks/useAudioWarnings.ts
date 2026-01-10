/**
 * Audio Warning System Hook
 * 
 * Provides audio feedback for timer warnings and state changes in the
 * result entry system. Supports configurable alert sounds with proper
 * mobile device handling.
 */

import { useCallback, useRef, useEffect } from 'react';

import type { AudioSettings } from '@/constants/audioSettings';

/**
 * Hook for managing audio warnings and feedback
 * 
 * Provides consistent audio cues for timer events with user preferences
 * and mobile device compatibility.
 * 
 * @param settings - Audio configuration preferences
 * @returns Audio control functions
 * 
 * @example
 * ```tsx
 * const audio = useAudioWarnings({
 *   warningSound: true,
 *   timeExpiredSound: true,
 *   volume: 0.8,
 *   soundType: 'chime'
 * });
 * 
 * const timer = useCountdownTimer({
 *   maxTimeMs: 120000,
 *   level: 'Novice',
 *   onTimeWarning: audio.playWarning,
 *   onTimeExpired: audio.playTimeExpired
 * });
 * ```
 */
export function useAudioWarnings(settings: AudioSettings) {
  const config = settings;
  
  // Audio context and nodes
  const audioContextRef = useRef<AudioContext | null>(null);
  const isInitializedRef = useRef(false);

  // Initialize audio context on first user interaction
  const initializeAudio = useCallback(async () => {
    if (isInitializedRef.current || typeof window === 'undefined') return;

    try {
      // Create audio context
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) {
        return;
      }

      audioContextRef.current = new AudioContextClass();
      
      // Resume context if suspended (required on many mobile browsers)
      if (audioContextRef.current?.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      isInitializedRef.current = true;
    } catch {
      // Audio initialization failed - continue without audio
    }
  }, []);

  // Play a tone with specified frequency and duration
  const playTone = useCallback(async (frequency: number, duration: number, type: OscillatorType = 'sine') => {
    if (!config.volume || config.volume === 0) return;

    try {
      await initializeAudio();
      
      const context = audioContextRef.current;
      if (!context) return;

      // Create oscillator and gain nodes
      const oscillator = context.createOscillator();
      const gainNode = context.createGain();

      // Configure oscillator
      oscillator.frequency.setValueAtTime(frequency, context.currentTime);
      oscillator.type = type;

      // Configure gain (volume envelope)
      gainNode.gain.setValueAtTime(0, context.currentTime);
      gainNode.gain.linearRampToValueAtTime(config.volume, context.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);

      // Connect nodes and play
      oscillator.connect(gainNode);
      gainNode.connect(context.destination);

      oscillator.start(context.currentTime);
      oscillator.stop(context.currentTime + duration);
    } catch {
      // Tone playback failed - continue silently
    }
  }, [config.volume, initializeAudio]);

  // Play warning sound (30-second alert)
  const playWarning = useCallback(async () => {
    if (!config.warningSound) return;

    switch (config.soundType) {
      case 'beep':
        // Single high-pitched beep
        await playTone(800, 0.2);
        break;
      case 'chime':
        // Gentle chime sequence
        await playTone(523, 0.15); // C5
        setTimeout(() => playTone(659, 0.15), 100); // E5
        break;
      case 'tone':
        // Double tone alert
        await playTone(700, 0.1);
        setTimeout(() => playTone(700, 0.1), 150);
        break;
    }
  }, [config.warningSound, config.soundType, playTone]);

  // Play time expired sound
  const playTimeExpired = useCallback(async () => {
    if (!config.timeExpiredSound) return;

    switch (config.soundType) {
      case 'beep':
        // Three urgent beeps
        await playTone(1000, 0.15);
        setTimeout(() => playTone(1000, 0.15), 200);
        setTimeout(() => playTone(1000, 0.15), 400);
        break;
      case 'chime':
        // Descending chime
        await playTone(659, 0.2); // E5
        setTimeout(() => playTone(523, 0.2), 150); // C5
        setTimeout(() => playTone(415, 0.3), 300); // G#4
        break;
      case 'tone':
        // Long urgent tone
        await playTone(900, 0.5);
        break;
    }
  }, [config.timeExpiredSound, config.soundType, playTone]);

  // Play start confirmation sound
  const playStart = useCallback(async () => {
    if (!config.startSound) return;
    await playTone(600, 0.1);
  }, [config.startSound, playTone]);

  // Play stop confirmation sound
  const playStop = useCallback(async () => {
    if (!config.stopSound) return;
    await playTone(400, 0.15, 'square');
  }, [config.stopSound, playTone]);

  // Test sound function for settings
  const playTestSound = useCallback(async () => {
    await playTone(659, 0.3, 'sine'); // E5 note
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

  // Initialize on first render (but audio won't work until user interaction)
  useEffect(() => {
    // Add event listeners for user interaction to initialize audio
    const handleUserInteraction = () => {
      initializeAudio();
      // Remove listeners after first interaction
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('touchstart', handleUserInteraction);
      document.removeEventListener('keydown', handleUserInteraction);
    };

    document.addEventListener('click', handleUserInteraction);
    document.addEventListener('touchstart', handleUserInteraction);
    document.addEventListener('keydown', handleUserInteraction);

    return () => {
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('touchstart', handleUserInteraction);
      document.removeEventListener('keydown', handleUserInteraction);
    };
  }, [initializeAudio]);

  return {
    playWarning,
    playTimeExpired,
    playStart,
    playStop,
    playTestSound,
    isAudioSupported: typeof window !== 'undefined' && 
                     Boolean(window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
  };
}

// Re-export for convenience
import { useCountdownTimer } from './useCountdownTimer';
export { useCountdownTimer };