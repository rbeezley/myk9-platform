import type { NotificationPayload } from './types';

export interface VoiceAnnouncementText {
  text: string;
  priority: 'normal' | 'high';
}

/**
 * Generates spoken-word text for a notification payload.
 * Returns null for types that shouldn't be spoken (e.g., announcements).
 */
export function generateVoiceText(payload: NotificationPayload): VoiceAnnouncementText | null {
  const data = payload.data ?? {};

  switch (payload.type) {
    case 'your_turn':
      return {
        text: generateYourTurnText(
          (data.dogName as string) ?? 'Your dog',
          (data.armband as string) ?? '',
          (data.dogsAhead as number) ?? 0
        ),
        priority: 'high',
      };

    case 'results_posted':
      return {
        text: `Results posted for ${(data.dogName as string) ?? 'your dog'} in ${(data.className as string) ?? 'class'}`,
        priority: 'normal',
      };

    case 'class_starting':
      return {
        text: `${(data.className as string) ?? 'Class'} is starting now`,
        priority: 'normal',
      };

    case 'check_in_reminder':
      return {
        text: `Time to check in ${(data.dogName as string) ?? 'your dog'} for ${(data.className as string) ?? 'class'}`,
        priority: 'normal',
      };

    case 'announcement': {
      const title = (payload.title || '')
        .replace(/^[\u{1F300}-\u{1FAF8}\u{2600}-\u{27BF}]+\s*/u, '')
        .replace(/^URGENT:\s*/i, '')
        .trim()
        .slice(0, 200);
      if (!title) return null;
      return {
        text: title,
        priority: payload.priority === 'urgent' ? 'high' : 'normal',
      };
    }

    default:
      return null;
  }
}

function generateYourTurnText(dogName: string, armband: string, dogsAhead: number): string {
  const armbandSuffix = armband ? `, number ${armband}` : '';

  if (dogsAhead <= 0) {
    return `${dogName}${armbandSuffix}, you're up next`;
  }

  const dogWord = dogsAhead === 1 ? 'dog' : 'dogs';
  return `${dogName}${armbandSuffix}, you're ${dogsAhead} ${dogWord} away`;
}
