import type { GeneratedPremium } from '@/types/premium-types';

type Narratives = GeneratedPremium['narratives'];

// Placeholder text older versions of generate-premium wrote when the AI call failed.
// Saved premiums may still carry it; it must never reach a printed or published premium.
const LEGACY_PLACEHOLDERS = new Set([
  'show hours to be announced.',
  'trial information to be announced.',
]);

export function stripPlaceholderNarrative(text: string): string {
  return LEGACY_PLACEHOLDERS.has(text.trim().toLowerCase()) ? '' : text;
}

export function stripPlaceholderNarratives(narratives: Narratives): Narratives {
  return {
    showHours: stripPlaceholderNarrative(narratives.showHours),
    trialInformation: stripPlaceholderNarrative(narratives.trialInformation),
  };
}
