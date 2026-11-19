import type { PremiumNarratives } from './publishedNarratives.ts';

export interface PremiumNarrativeOutcome {
  narratives: PremiumNarratives;
  narrativeGenerationError: string | null;
}

/**
 * MYK9-2244: a facts-only request returns the show's current facts for a republish. It never
 * reaches the narrative model or the 5-per-15-minutes generation allowance: `generate` (which
 * owns both) is not called, and the narratives are whatever is already published.
 */
export async function resolvePremiumNarratives(args: {
  factsOnly: boolean;
  published: PremiumNarratives;
  generate: () => Promise<PremiumNarrativeOutcome>;
}): Promise<PremiumNarrativeOutcome> {
  if (args.factsOnly) {
    return { narratives: args.published, narrativeGenerationError: null };
  }
  return args.generate();
}
