/**
 * Voice Announcement Service
 *
 * Provides text-to-speech announcements for scoring events using the Web Speech API.
 * Features:
 * - Multi-language support
 * - Voice selection (male/female, different accents)
 * - Rate and pitch control
 * - Queue management for multiple announcements
 * - Settings integration
 *
 * Browser Support:
 * - Chrome/Edge: Full support ✅
 * - Safari: Full support ✅
 * - Firefox: Partial support (limited voices) ⚠️
 * - Mobile: iOS 7+, Android 4.4+ ✅
 */

import { logger } from '@/utils/logger';

export interface VoiceConfig {
  /** Voice to use (defaults to system default) */
  voice: SpeechSynthesisVoice | null;
  /** Language code (e.g., 'en-US', 'es-ES') */
  lang: string;
  /** Speech rate (0.1 to 10, default: 1) */
  rate: number;
  /** Speech pitch (0 to 2, default: 1) */
  pitch: number;
  /** Speech volume (0 to 1, default: 1) */
  volume: number;
}

export interface AnnouncementOptions {
  /** Text to announce */
  text: string;
  /** Priority (high priority interrupts current speech) */
  priority?: 'low' | 'normal' | 'high';
  /** Custom voice configuration */
  voiceConfig?: Partial<VoiceConfig>;
  /** Callback when announcement completes */
  onEnd?: () => void;
  /** Callback on error */
  onError?: (error: SpeechSynthesisErrorEvent) => void;
}

class VoiceAnnouncementService {
  private synthesis: SpeechSynthesis | null = null;
  private voices: SpeechSynthesisVoice[] = [];
  private queue: SpeechSynthesisUtterance[] = [];
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private isEnabled: boolean = false;
  private isScoringActive: boolean = false; // Track if actively timing a scoresheet
  private defaultConfig: VoiceConfig = {
    voice: null,
    lang: 'en-US',
    rate: 1.0,
    pitch: 1.0,
    volume: 1.0,
  };

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.synthesis = window.speechSynthesis;
      this.loadVoices();

      // Voices may load asynchronously, listen for the event
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = () => {
          this.loadVoices();
        };
      }
    }
  }

  /**
   * Load available voices from the browser
   */
  private loadVoices(): void {
    if (!this.synthesis) return;

    this.voices = this.synthesis.getVoices();

    // Set default voice - prefer clear, neutral US English voices
    if (!this.defaultConfig.voice && this.voices.length > 0) {
      let defaultVoice;

      // Priority 1: Google US English (most consistent across browsers)
      defaultVoice = this.voices.find(v =>
        v.name.toLowerCase().includes('google') &&
        v.lang.startsWith('en-US')
      );

      // Priority 2: Microsoft US English (common on Windows)
      if (!defaultVoice) {
        defaultVoice = this.voices.find(v =>
          v.name.toLowerCase().includes('microsoft') &&
          v.lang.startsWith('en-US')
        );
      }

      // Priority 3: Any US English voice
      if (!defaultVoice) {
        defaultVoice = this.voices.find(v => v.lang === 'en-US');
      }

      // Priority 4: Any English voice (UK, AU, etc.)
      if (!defaultVoice) {
        defaultVoice = this.voices.find(v => v.lang.startsWith('en-'));
      }

      // Last resort: first available voice
      this.defaultConfig.voice = defaultVoice || this.voices[0];
    }
  }

  /**
   * Get all available voices
   */
  public getAvailableVoices(): SpeechSynthesisVoice[] {
    return this.voices;
  }

  /**
   * Get voices filtered by language
   */
  public getVoicesByLanguage(lang: string): SpeechSynthesisVoice[] {
    return this.voices.filter(v => v.lang.startsWith(lang));
  }

  /**
   * Get the default voice configuration
   */
  public getDefaultConfig(): VoiceConfig {
    return { ...this.defaultConfig };
  }

  /**
   * Update the default voice configuration
   */
  public setDefaultConfig(config: Partial<VoiceConfig>): void {
    // Filter out undefined values to prevent overwriting good defaults with undefined
    const filteredConfig: Partial<VoiceConfig> = {};

    if (config.voice !== undefined) filteredConfig.voice = config.voice;
    if (config.lang !== undefined) filteredConfig.lang = config.lang;
    if (config.rate !== undefined && isFinite(config.rate)) filteredConfig.rate = config.rate;
    if (config.pitch !== undefined && isFinite(config.pitch)) filteredConfig.pitch = config.pitch;
    if (config.volume !== undefined && isFinite(config.volume)) filteredConfig.volume = config.volume;

    this.defaultConfig = { ...this.defaultConfig, ...filteredConfig };
  }

  /**
   * Enable or disable voice announcements
   */
  public setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    if (!enabled) {
      this.cancelAll();
    }
  }

  /**
   * Check if voice announcements are enabled
   */
  public getEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * Check if the browser supports speech synthesis
   */
  public isSupported(): boolean {
    return this.synthesis !== null;
  }

  /**
   * Set whether scoring is currently active (timer running)
   * When scoring is active, push notification voice announcements are suppressed
   */
  public setScoringActive(active: boolean): void {
    this.isScoringActive = active;
}

  /**
   * Check if scoring is currently active
   */
  public isScoringInProgress(): boolean {
    return this.isScoringActive;
  }

  /**
   * Announce text using speech synthesis
   */
  public announce(options: AnnouncementOptions): void {
    // Check if enabled - also check localStorage as fallback for race conditions
    // where the store subscription hasn't fired yet
    let enabled = this.isEnabled;
    if (!enabled) {
      try {
        const stored = localStorage.getItem('myK9Q_settings');
        if (stored) {
          const parsed = JSON.parse(stored);
          enabled = parsed?.state?.settings?.voiceAnnouncements === true;
          if (enabled) {
            this.isEnabled = true; // Sync the state
          }
        }
      } catch {
        // Ignore parse errors
      }
    }

    if (!enabled || !this.synthesis) {
      return;
    }

    const utterance = this.createUtterance(options);

    // Handle priority
    if (options.priority === 'high') {
      this.cancelAll();
      this.speak(utterance);
    } else if (options.priority === 'normal' && this.currentUtterance) {
      this.cancel();
      this.speak(utterance);
    } else {
      this.speak(utterance);
    }
  }

  /**
   * Create a speech synthesis utterance from options
   */
  private createUtterance(options: AnnouncementOptions): SpeechSynthesisUtterance {
    const utterance = new SpeechSynthesisUtterance(options.text);

    // Apply voice configuration, filtering out undefined values
    const config = { ...this.defaultConfig, ...(options.voiceConfig || {}) };

    if (config.voice) {
      utterance.voice = config.voice;
    }
    // Only set if defined and is a finite number
    if (config.lang !== undefined) {
      utterance.lang = config.lang;
    }
    if (config.rate !== undefined && isFinite(config.rate)) {
      utterance.rate = config.rate;
    }
    if (config.pitch !== undefined && isFinite(config.pitch)) {
      utterance.pitch = config.pitch;
    }
    if (config.volume !== undefined && isFinite(config.volume)) {
      utterance.volume = config.volume;
    }

    // Set up callbacks
    utterance.onstart = () => {};

    utterance.onend = () => {
this.currentUtterance = null;
      if (options.onEnd) {
        options.onEnd();
      }
    };

    utterance.onerror = (event) => {
      logger.error('[VoiceService] Speech synthesis error:', event);
      logger.error('[VoiceService] Error details:', {
        error: event.error,
        charIndex: event.charIndex,
        elapsedTime: event.elapsedTime,
        name: event.name
      });
      this.currentUtterance = null;
      if (options.onError) {
        options.onError(event);
      }
    };

    return utterance;
  }

  /**
   * Speak an utterance
   */
  private speak(utterance: SpeechSynthesisUtterance): void {
    if (!this.synthesis) return;

    this.currentUtterance = utterance;
    this.synthesis.speak(utterance);
  }

  /**
   * Cancel the current announcement
   */
  public cancel(): void {
    if (this.synthesis) {
      this.synthesis.cancel();
      this.currentUtterance = null;
    }
  }

  /**
   * Cancel all queued announcements
   */
  public cancelAll(): void {
    this.cancel();
    this.queue = [];
    void this.queue; // Reserved for future queued announcements feature
  }

  /**
   * Pause current announcement
   */
  public pause(): void {
    if (this.synthesis && this.synthesis.speaking) {
      this.synthesis.pause();
    }
  }

  /**
   * Resume paused announcement
   */
  public resume(): void {
    if (this.synthesis && this.synthesis.paused) {
      this.synthesis.resume();
    }
  }

  /**
   * Check if currently speaking
   */
  public isSpeaking(): boolean {
    return this.synthesis?.speaking ?? false;
  }

  /**
   * Check if currently paused
   */
  public isPaused(): boolean {
    return this.synthesis?.paused ?? false;
  }

  // ========================================
  // PRESET ANNOUNCEMENTS FOR SCORING
  // ========================================

  /**
   * Announce timer countdown (e.g., "30 seconds remaining")
   */
  public announceTimeRemaining(seconds: number): void {
    let text = '';

    if (seconds === 30) {
      text = '30 seconds remaining';
    } else if (seconds === 10) {
      text = '10 seconds remaining';
    } else if (seconds <= 5 && seconds > 0) {
      text = `${seconds}`;
    } else if (seconds === 0) {
      text = 'Time';
    }

    if (text) {
      this.announce({
        text,
        priority: 'high',
      });
    }
  }

  /**
   * Announce fault/error
   */
  public announceFault(faultType: string): void {
    this.announce({
      text: faultType,
      priority: 'high',
    });
  }

  /**
   * Announce class complete
   */
  public announceClassComplete(className: string): void {
    this.announce({
      text: `${className} complete`,
      priority: 'normal',
    });
  }

  /**
   * Test voice announcement (for settings)
   * Always works regardless of enabled state (for testing purposes)
   */
  public testVoice(text: string = 'This is a test of the voice announcement system'): void {
    if (!this.synthesis) {
      logger.warn('Speech synthesis not supported in this browser');
      return;
    }

    // Cancel any previous speech to work around Chrome speechSynthesis queue bug
    this.cancel();

    // Chrome bug workaround: Add small delay after cancel to ensure queue clears
    setTimeout(() => {
      // Reload voices to ensure we have them (they may not have loaded yet)
      if (this.voices.length === 0) {
        this.loadVoices();
      }

      // Temporarily bypass the enabled check for testing
      const utterance = this.createUtterance({
        text,
        priority: 'high',
      });

      this.speak(utterance);
    }, 100);
  }
}

// Singleton instance
const voiceAnnouncementService = new VoiceAnnouncementService();

// Subscribe to settings store to keep voice service in sync
// This runs when the module is imported, ensuring the service
// is properly initialized regardless of component mount order
import('../stores/settingsStore').then(({ useSettingsStore }) => {
  // Initial sync from current state (may be default or hydrated)
  const initialState = useSettingsStore.getState();
  voiceAnnouncementService.setEnabled(initialState.settings.voiceAnnouncements);

  // Subscribe to future changes (including hydration from localStorage)
  useSettingsStore.subscribe((state) => {
    const enabled = state.settings.voiceAnnouncements;
    if (voiceAnnouncementService.getEnabled() !== enabled) {
      voiceAnnouncementService.setEnabled(enabled);
    }
  });
});

export default voiceAnnouncementService;
