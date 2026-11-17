import type { GeneratedPremium } from '@/types/premium-types';

type Narratives = GeneratedPremium['narratives'];

// Placeholder text older versions of generate-premium wrote when the AI call failed.
// Saved premiums may still carry it; it must never reach a printed or published premium.
const LEGACY_PLACEHOLDERS = new Set([
  'show hours to be announced.',
  'trial information to be announced.',
]);

export const NARRATIVE_REFRESH_FAILED_MESSAGE =
  "Couldn't refresh the narratives. Your current text is kept. Try again.";

export function stripPlaceholderNarrative(text: string): string {
  return LEGACY_PLACEHOLDERS.has(text.trim().toLowerCase()) ? '' : text;
}

export function stripPlaceholderNarratives(narratives: Narratives): Narratives {
  return {
    showHours: stripPlaceholderNarrative(narratives.showHours),
    trialInformation: stripPlaceholderNarrative(narratives.trialInformation),
  };
}

/** True when a generation result did not produce usable narratives. */
export function narrativeGenerationFailed(result: GeneratedPremium): boolean {
  return (
    Boolean(result.narrativeGenerationError) ||
    !result.narratives.showHours.trim() ||
    !result.narratives.trialInformation.trim()
  );
}
