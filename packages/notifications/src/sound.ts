import type { NotificationPriority } from './types';

let audioContext: AudioContext | null = null;
let lastPlayTime = 0;
const THROTTLE_MS = 1000;

function getAudioContext(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

async function ensureResumed(ctx: AudioContext): Promise<void> {
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }
}

function playTone(
  ctx: AudioContext,
  frequency: number,
  startOffset: number,
  duration: number,
  volume: number
): void {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, ctx.currentTime + startOffset);

  gain.gain.setValueAtTime(0, ctx.currentTime + startOffset);
  gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + startOffset + 0.02);
  gain.gain.linearRampToValueAtTime(0, ctx.currentTime + startOffset + duration);

  oscillator.connect(gain);
  gain.connect(ctx.destination);

  oscillator.start(ctx.currentTime + startOffset);
  oscillator.stop(ctx.currentTime + startOffset + duration);
}

/**
 * Plays a synthesized notification chime.
 * - normal: gentle two-tone chime
 * - high: ascending three-tone alert
 * - urgent: rapid ascending pattern with repeat
 */
export async function playNotificationSound(priority: NotificationPriority): Promise<void> {
  const now = Date.now();
  if (now - lastPlayTime < THROTTLE_MS) return;
  lastPlayTime = now;

  const ctx = getAudioContext();
  if (!ctx) return;

  await ensureResumed(ctx);

  switch (priority) {
    case 'normal':
      // Gentle two-tone chime: A5 -> C6
      playTone(ctx, 880, 0, 0.15, 0.3);
      playTone(ctx, 1047, 0.15, 0.2, 0.3);
      break;

    case 'high':
      // Ascending three-tone: G5 -> B5 -> D6
      playTone(ctx, 784, 0, 0.12, 0.4);
      playTone(ctx, 988, 0.12, 0.12, 0.4);
      playTone(ctx, 1175, 0.24, 0.18, 0.4);
      break;

    case 'urgent':
      // Rapid ascending with repeat
      playTone(ctx, 784, 0, 0.1, 0.5);
      playTone(ctx, 988, 0.1, 0.1, 0.5);
      playTone(ctx, 1175, 0.2, 0.1, 0.5);
      playTone(ctx, 784, 0.4, 0.1, 0.5);
      playTone(ctx, 988, 0.5, 0.1, 0.5);
      playTone(ctx, 1175, 0.6, 0.15, 0.5);
      break;
  }
}

/** Plays a test sound at the specified priority (defaults to normal). */
export async function testSound(priority: NotificationPriority = 'normal'): Promise<void> {
  // Bypass throttle for test sounds
  lastPlayTime = 0;
  await playNotificationSound(priority);
}
