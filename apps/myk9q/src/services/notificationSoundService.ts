/**
 * Notification Sound Service
 *
 * Plays audio alerts when push notifications are received.
 * Uses Web Audio API to generate tones (no external audio files needed).
 */

import { useSettingsStore } from '@/stores/settingsStore';
import { logger } from '@/utils/logger';

type Priority = 'normal' | 'high' | 'urgent';

class NotificationSoundService {
  private static instance: NotificationSoundService;
  private audioContext: AudioContext | null = null;
  private lastPlayTime = 0;
  private minInterval = 1000; // Minimum 1 second between sounds to avoid spam

  private constructor() {
    // AudioContext is created lazily on first use (requires user gesture)
  }

  static getInstance(): NotificationSoundService {
    if (!NotificationSoundService.instance) {
      NotificationSoundService.instance = new NotificationSoundService();
    }
    return NotificationSoundService.instance;
  }

  /**
   * Initialize audio context (must be called after user gesture)
   */
  private initAudioContext(): AudioContext | null {
    if (this.audioContext) {
      return this.audioContext;
    }

    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      return this.audioContext;
    } catch (error) {
      logger.warn('Web Audio API not supported:', error);
      return null;
    }
  }

  /**
   * Play a notification chime based on priority
   */
  async playNotificationSound(priority: Priority = 'normal'): Promise<void> {
    // Check if notifications/sounds are enabled
    const { settings } = useSettingsStore.getState();
    if (!settings.enableNotifications) {
      return;
    }

    // Throttle sounds to prevent spam
    const now = Date.now();
    if (now - this.lastPlayTime < this.minInterval) {
      return;
    }
    this.lastPlayTime = now;

    const ctx = this.initAudioContext();
    if (!ctx) return;

    // Resume audio context if suspended (browser autoplay policy)
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch (error) {
        logger.warn('Could not resume audio context:', error);
        return;
      }
    }

    try {
      switch (priority) {
        case 'urgent':
          await this.playUrgentChime(ctx);
          break;
        case 'high':
          await this.playHighChime(ctx);
          break;
        default:
          await this.playNormalChime(ctx);
      }
    } catch (error) {
      logger.error('Error playing notification sound:', error);
    }
  }

  /**
   * Normal priority: Single pleasant chime
   */
  private async playNormalChime(ctx: AudioContext): Promise<void> {
    // Two-tone pleasant chime (like a doorbell)
    await this.playTone(ctx, 880, 0.15, 0.3);  // A5
    await this.playTone(ctx, 1047, 0.15, 0.25); // C6
  }

  /**
   * High priority: Double chime
   */
  private async playHighChime(ctx: AudioContext): Promise<void> {
    // Ascending three-tone alert
    await this.playTone(ctx, 784, 0.1, 0.35);  // G5
    await this.playTone(ctx, 988, 0.1, 0.35);  // B5
    await this.playTone(ctx, 1175, 0.15, 0.3); // D6
  }

  /**
   * Urgent priority: Attention-grabbing alert
   */
  private async playUrgentChime(ctx: AudioContext): Promise<void> {
    // Rapid ascending tones that demand attention
    await this.playTone(ctx, 880, 0.08, 0.4);   // A5
    await this.delay(30);
    await this.playTone(ctx, 1047, 0.08, 0.4);  // C6
    await this.delay(30);
    await this.playTone(ctx, 1319, 0.08, 0.4);  // E6
    await this.delay(100);
    // Repeat for emphasis
    await this.playTone(ctx, 880, 0.08, 0.4);
    await this.delay(30);
    await this.playTone(ctx, 1047, 0.08, 0.4);
    await this.delay(30);
    await this.playTone(ctx, 1319, 0.15, 0.35);
  }

  /**
   * Play a single tone
   */
  private playTone(
    ctx: AudioContext,
    frequency: number,
    duration: number,
    volume: number = 0.3
  ): Promise<void> {
    return new Promise((resolve) => {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.frequency.value = frequency;
      oscillator.type = 'sine';

      // Envelope for smooth attack/release
      const now = ctx.currentTime;
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(volume, now + 0.01); // Quick attack
      gainNode.gain.linearRampToValueAtTime(0, now + duration);  // Smooth release

      oscillator.start(now);
      oscillator.stop(now + duration);

      oscillator.onended = () => resolve();
    });
  }

  /**
   * Simple delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Test the notification sound (for settings page)
   */
  async testSound(priority: Priority = 'normal'): Promise<void> {
    // Bypass throttle for testing
    this.lastPlayTime = 0;
    await this.playNotificationSound(priority);
  }

  /**
   * Play a 30-second warning chime for timer
   * This plays regardless of voice announcement settings
   * but respects the overall notification sound setting
   */
  async playTimerWarningChime(): Promise<void> {
    // Check if notifications/sounds are enabled at the system level
    const { settings } = useSettingsStore.getState();
    if (!settings.enableNotifications) {
      return;
    }

    // Allow more frequent plays for timer warnings (500ms min)
    const now = Date.now();
    if (now - this.lastPlayTime < 500) {
      return;
    }
    this.lastPlayTime = now;

    const ctx = this.initAudioContext();
    if (!ctx) return;

    // Resume audio context if suspended (browser autoplay policy)
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch (error) {
        logger.warn('Could not resume audio context:', error);
        return;
      }
    }

    try {
      // Distinctive warning chime: descending tones (feels like "time running out")
      await this.playTone(ctx, 1047, 0.12, 0.35);  // C6
      await this.delay(50);
      await this.playTone(ctx, 880, 0.12, 0.35);   // A5
      await this.delay(50);
      await this.playTone(ctx, 784, 0.18, 0.3);    // G5
    } catch (error) {
      logger.error('Error playing timer warning chime:', error);
    }
  }
}

export const notificationSoundService = NotificationSoundService.getInstance();
export default notificationSoundService;
