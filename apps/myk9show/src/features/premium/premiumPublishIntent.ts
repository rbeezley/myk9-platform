import type { GeneratedPremium } from '@/types/premium-types';

export interface PremiumPublishIntent {
  premium: GeneratedPremium;
  inkSaver: boolean;
}

export interface PremiumPublishAttempt {
  schemaVersion: 4;
  mode: 'generated' | 'draft';
  intentKey: string;
  showId: string;
  publisherId: string;
  fingerprint: string;
  intent: PremiumPublishIntent;
  artifactId: string;
  publishVersion: number;
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map(
        key => `${JSON.stringify(key)}:${stableSerialize((value as Record<string, unknown>)[key])}`
      )
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function premiumPublishIntentFingerprint(
  intent: PremiumPublishIntent,
  publisherId = ''
): string {
  return stableSerialize({ premium: intent.premium, inkSaver: intent.inkSaver, publisherId });
}

export function premiumPublishDraftKey(intent: PremiumPublishIntent): string {
  return stableSerialize({ premium: intent.premium, inkSaver: intent.inkSaver });
}
