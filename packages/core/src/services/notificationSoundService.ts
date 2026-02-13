/**
 * Notification Sound Service
 *
 * Provides a shared interface and default no-op implementation for notification sounds.
 * Apps can use this stub directly or provide their own implementation
 * (e.g., myk9q provides a Web Audio API implementation).
 */

export interface NotificationSoundServiceInterface {
  playWarningSound(): void;
  playSuccessSound(): void;
  playErrorSound(): void;
  playTimerWarningChime(): void;
}

class NotificationSoundService implements NotificationSoundServiceInterface {
  playWarningSound(): void {
    // No-op — override in app-specific implementation
  }

  playSuccessSound(): void {
    // No-op — override in app-specific implementation
  }

  playErrorSound(): void {
    // No-op — override in app-specific implementation
  }

  playTimerWarningChime(): void {
    // No-op — override in app-specific implementation
  }
}

export const notificationSoundService = new NotificationSoundService();
export default notificationSoundService;
