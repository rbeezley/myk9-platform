/**
 * Voice Announcement Service
 *
 * Provides a shared interface and default no-op implementation for voice announcements.
 * Apps can use this stub directly or provide their own implementation
 * (e.g., myk9q provides a Web Speech API implementation).
 */

export interface VoiceAnnouncementServiceInterface {
  speakTimeRemaining(seconds: number): void;
  speak(text: string): void;
  cancel(): void;
  announceTimeRemaining(seconds: number): void;
  setScoringActive(active: boolean): void;
}

class VoiceAnnouncementService implements VoiceAnnouncementServiceInterface {
  speakTimeRemaining(_seconds: number): void {
    // No-op — override in app-specific implementation
  }

  speak(_text: string): void {
    // No-op — override in app-specific implementation
  }

  cancel(): void {
    // No-op — override in app-specific implementation
  }

  announceTimeRemaining(_seconds: number): void {
    // No-op — override in app-specific implementation
  }

  setScoringActive(_active: boolean): void {
    // No-op — override in app-specific implementation
  }
}

const voiceAnnouncementService = new VoiceAnnouncementService();
export default voiceAnnouncementService;
