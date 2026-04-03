type VoiceQuality = 'recommended' | 'other';
type Platform = 'mac' | 'ios' | 'android' | 'windows' | 'unknown';

/**
 * Classifies a voice by name as recommended (enhanced/premium/neural) or other (basic).
 */
export function classifyVoice(voiceName: string): VoiceQuality {
  const name = voiceName.toLowerCase();
  if (
    name.includes('premium') ||
    name.includes('enhanced') ||
    name.includes('google') ||
    name.includes('natural') ||
    name.includes('neural')
  ) {
    return 'recommended';
  }
  return 'other';
}

/**
 * Returns true if at least one voice in the list is classified as recommended.
 */
export function hasRecommendedVoice(voices: SpeechSynthesisVoice[]): boolean {
  return voices.some(v => classifyVoice(v.name) === 'recommended');
}

/**
 * Groups and sorts voices: recommended first, then other. Each group sorted alphabetically.
 */
export function groupVoices(voices: SpeechSynthesisVoice[]): {
  recommended: SpeechSynthesisVoice[];
  other: SpeechSynthesisVoice[];
} {
  const recommended: SpeechSynthesisVoice[] = [];
  const other: SpeechSynthesisVoice[] = [];

  for (const voice of voices) {
    if (classifyVoice(voice.name) === 'recommended') {
      recommended.push(voice);
    } else {
      other.push(voice);
    }
  }

  recommended.sort((a, b) => a.name.localeCompare(b.name));
  other.sort((a, b) => a.name.localeCompare(b.name));

  return { recommended, other };
}

/**
 * Detects user platform from user agent string.
 * iPadOS 13+ reports a Macintosh UA — maxTouchPoints distinguishes it from a real Mac.
 */
export function detectPlatform(userAgent: string, maxTouchPoints?: number): Platform {
  const ua = userAgent.toLowerCase();
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) return 'ios';
  if (ua.includes('macintosh') || ua.includes('mac os')) {
    const touch =
      maxTouchPoints ?? (typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0);
    return touch > 0 ? 'ios' : 'mac';
  }
  if (ua.includes('android')) return 'android';
  if (ua.includes('windows')) return 'windows';
  return 'unknown';
}

interface VoiceInstructions {
  platform: string;
  steps: string[];
}

/**
 * Returns platform-specific numbered instructions for downloading enhanced voices.
 * Returns null for unknown platforms.
 */
export function getEnhancedVoiceInstructions(
  platform: Platform | string
): VoiceInstructions | null {
  switch (platform) {
    case 'mac':
      return {
        platform: 'Mac',
        steps: [
          'Open System Settings on your Mac',
          'Go to Accessibility > Spoken Content',
          'Click System Voice > Manage Voices',
          'Download any voice marked "Premium"',
          'Come back here and tap Check for new voices',
        ],
      };
    case 'ios':
      return {
        platform: 'iPhone / iPad',
        steps: [
          'Open Settings on your device',
          'Go to Accessibility > Spoken Content > Voices',
          'Tap English',
          'Download any voice marked "Enhanced" or "Premium"',
          'Come back here and tap Check for new voices',
        ],
      };
    case 'android':
      return {
        platform: 'Android',
        steps: [
          'Open Settings on your device',
          'Go to General Management > Text-to-Speech',
          'Tap Install voice data',
          'Download the high-quality English voices',
          'Come back here and tap Check for new voices',
        ],
      };
    case 'windows':
      return {
        platform: 'Windows',
        steps: [
          'Open Settings on your PC',
          'Go to Time & Language > Speech',
          'Click Manage voices and add English voices',
          'Come back here and tap Check for new voices',
        ],
      };
    default:
      return null;
  }
}
