/**
 * Notification Voice Text Generation Utilities
 *
 * Extracted from notificationService.ts
 * Pure utility functions for generating voice announcement text from notification payloads.
 *
 * Features:
 * - Type-specific voice text generation
 * - Dog name and armband formatting
 * - Placement ordinal conversion
 * - Announcement text sanitization
 */

/**
 * Notification payload structure
 */
export interface NotificationPayload {
  type: string;
  title: string;
  body?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  data?: Record<string, any>;
}

/**
 * Voice announcement result
 */
export interface VoiceAnnouncementText {
  text: string;
  priority: 'low' | 'normal' | 'high';
}

/**
 * Generate voice announcement text for "your turn" notification
 *
 * @param dogName - Dog's call name
 * @param armband - Armband number
 * @param dogsAhead - Number of dogs ahead in queue
 * @returns Formatted voice text
 *
 * @example
 * ```ts
 * generateYourTurnText('Max', '42', 1);
 * // Returns: "Max, number 42, you're up next"
 *
 * generateYourTurnText('Bella', '15', 3);
 * // Returns: "Bella, number 15, you're 3 dogs away"
 * ```
 */
export function generateYourTurnText(
  dogName: string,
  armband: string,
  dogsAhead: number
): string {
  if (dogsAhead === 1) {
    return dogName
      ? `${dogName}, number ${armband}, you're up next`
      : "You're up next";
  } else {
    return dogName
      ? `${dogName}, number ${armband}, you're ${dogsAhead} dogs away`
      : `You're ${dogsAhead} dogs away`;
  }
}

/**
 * Generate voice announcement text for results posted notification
 *
 * @param dogName - Dog's call name
 * @param placement - Final placement (1-4 for top placements)
 * @param qualified - Whether the dog qualified
 * @returns Formatted voice text
 *
 * @example
 * ```ts
 * generateResultsText('Max', 1, true);
 * // Returns: "Max, first place, qualified"
 *
 * generateResultsText('Bella', 3, false);
 * // Returns: "Bella, third place"
 *
 * generateResultsText('Luna', undefined, true);
 * // Returns: "Results posted for Luna"
 * ```
 */
export function generateResultsText(
  dogName: string,
  placement?: number,
  qualified?: boolean
): string {
  if (placement && typeof placement === 'number' && placement >= 1 && placement <= 4) {
    const ordinals = ['', 'first', 'second', 'third', 'fourth'];
    let text = `${dogName}, ${ordinals[placement]} place`;
    if (qualified) {
      text += ', qualified';
    }
    return text;
  } else {
    return dogName ? `Results posted for ${dogName}` : 'Results posted';
  }
}

/**
 * Generate voice announcement text for class starting notification
 *
 * @param className - Name of the class
 * @returns Formatted voice text
 *
 * @example
 * ```ts
 * generateClassStartingText('Novice A');
 * // Returns: "Novice A starting soon"
 *
 * generateClassStartingText('');
 * // Returns: "Class starting soon"
 * ```
 */
export function generateClassStartingText(className: string): string {
  return className ? `${className} starting soon` : 'Class starting soon';
}

/**
 * Sanitize announcement text for voice synthesis
 *
 * Removes emoji and standardizes urgent announcement format.
 *
 * @param title - Raw notification title
 * @returns Sanitized text for voice synthesis
 *
 * @example
 * ```ts
 * sanitizeAnnouncementText('🚨 URGENT: Ring change');
 * // Returns: "Urgent announcement, Ring change"
 *
 * sanitizeAnnouncementText('🎉 Congratulations!');
 * // Returns: "Congratulations!"
 * ```
 */
export function sanitizeAnnouncementText(title: string): string {
  return title
    .replace(/🚨/g, '')
    .replace(/URGENT:/g, 'Urgent announcement,')
    .trim();
}

/**
 * Generate voice announcement text from notification payload
 *
 * Main entry point for converting any notification type to voice text.
 *
 * @param payload - Notification payload
 * @returns Voice announcement text and priority, or null if no voice announcement
 *
 * @example
 * ```ts
 * generateVoiceText({
 *   type: 'your_turn',
 *   title: 'Your turn',
 *   data: { callName: 'Max', armbandNumber: '42', dogsAhead: 1 }
 * });
 * // Returns: { text: "Max, number 42, you're up next", priority: 'normal' }
 *
 * generateVoiceText({
 *   type: 'urgent_announcement',
 *   title: '🚨 URGENT: Ring change',
 *   priority: 'urgent'
 * });
 * // Returns: { text: "Urgent announcement, Ring change", priority: 'high' }
 * ```
 */
export function generateVoiceText(
  payload: NotificationPayload
): VoiceAnnouncementText | null {
  let text = '';

  switch (payload.type) {
    case 'your_turn': {
      const dogName = payload.data?.callName || '';
      const armband = payload.data?.armbandNumber || '';
      const dogsAhead = payload.data?.dogsAhead || 1;
      text = generateYourTurnText(dogName, armband, dogsAhead);
      break;
    }

    case 'results_posted': {
      const dogName = (payload.data?.callName as string) || '';
      const placement = payload.data?.placement as number | undefined;
      const qualified = payload.data?.qualified as boolean | undefined;
      text = generateResultsText(dogName, placement, qualified);
      break;
    }

    case 'class_starting': {
      const className = payload.data?.className || '';
      text = generateClassStartingText(className);
      break;
    }

    case 'announcement':
    case 'urgent_announcement': {
      text = sanitizeAnnouncementText(payload.title);
      break;
    }

    case 'system_update': {
      text = 'App update available';
      break;
    }

    case 'sync_error': {
      text = 'Sync error occurred';
      break;
    }

    default:
      // For unknown types, use title
      text = payload.title;
  }

  if (!text) {
    return null;
  }

  return {
    text,
    priority: payload.priority === 'urgent' ? 'high' : 'normal',
  };
}

/**
 * Check if a notification type supports voice announcements
 *
 * @param notificationType - Type of notification
 * @returns True if voice announcement is supported
 *
 * @example
 * ```ts
 * supportsVoiceAnnouncement('your_turn'); // true
 * supportsVoiceAnnouncement('silent_update'); // false
 * ```
 */
export function supportsVoiceAnnouncement(notificationType: string): boolean {
  const supportedTypes = [
    'your_turn',
    'results_posted',
    'class_starting',
    'announcement',
    'urgent_announcement',
    'system_update',
    'sync_error',
  ];

  return supportedTypes.includes(notificationType);
}
