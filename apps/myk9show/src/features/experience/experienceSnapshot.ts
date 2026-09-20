import type { ShowStyle } from '@/features/registries';
import type { GeneratedPremium, PremiumSupplemental } from '@/types/premium-types';

export interface ShowExperienceSnapshot {
  style: ShowStyle;
  generatedAt: string;
  narratives: GeneratedPremium['narratives'];
  supplemental: PremiumSupplemental;
  outputs: {
    /** New snapshots persist only the trusted immutable Storage identity. */
    premiumPath?: string | null;
    /** Legacy snapshots may still carry a URL from before MYK9-694. */
    premiumUrl?: string | null;
  };
}

export function buildExperienceSnapshot({
  premium,
  premiumPath,
  publishedAt,
}: {
  premium: Pick<GeneratedPremium, 'style' | 'narratives' | 'supplemental'>;
  premiumPath: string | null;
  publishedAt: string;
}): ShowExperienceSnapshot {
  return {
    style: premium.style,
    generatedAt: publishedAt,
    narratives: premium.narratives,
    supplemental: premium.supplemental,
    outputs: { premiumPath, premiumUrl: null },
  };
}

export function getLiveExperienceSnapshot(show: {
  experienceIsPublished?: boolean;
  experiencePublishedContent?: ShowExperienceSnapshot | null;
}): ShowExperienceSnapshot | null {
  if (!show.experienceIsPublished) return null;
  return show.experiencePublishedContent ?? null;
}
