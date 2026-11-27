import type { GeneratedPremium, PremiumStyle } from '../../types/premium-types';

/** The premium the editor offers for the PDF and Save: its text over the loaded facts. */
export function buildFinalPremium(parts: {
  original: GeneratedPremium;
  supplemental: GeneratedPremium['supplemental'] | null;
  narratives: GeneratedPremium['narratives'] | null;
  style: PremiumStyle | undefined;
  /** MYK9-2173: the resolved image counts only for the URL it was resolved from. */
  resolvedCover: string | null;
}): GeneratedPremium | null {
  const { original, supplemental, narratives, style, resolvedCover } = parts;
  if (!supplemental || !narratives) return null;
  return {
    ...original,
    style: style ?? original.style,
    supplemental: { ...supplemental, coverImageUrl: resolvedCover ?? supplemental.coverImageUrl },
    narratives,
  };
}
