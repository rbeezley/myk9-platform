import type { ShowStyle } from '@/features/registries';
import type { GeneratedPremium, PremiumSupplemental } from '@/types/premium-types';

export interface ShowExperienceSnapshot {
  style: ShowStyle;
  generatedAt: string;
  narratives: GeneratedPremium['narratives'];
  supplemental: PremiumSupplemental;
  outputs: {
    premiumUrl: string | null;
  };
}

export function buildExperienceSnapshot({
  premium,
  premiumUrl,
  publishedAt,
}: {
  premium: Pick<GeneratedPremium, 'style' | 'narratives' | 'supplemental'>;
  premiumUrl: string | null;
  publishedAt: string;
}): ShowExperienceSnapshot {
  return {
    style: premium.style,
    generatedAt: publishedAt,
    narratives: premium.narratives,
    supplemental: premium.supplemental,
    outputs: { premiumUrl },
  };
}

export function getLiveExperienceSnapshot(show: {
  experienceIsPublished?: boolean;
  experiencePublishedContent?: ShowExperienceSnapshot | null;
}): ShowExperienceSnapshot | null {
  if (!show.experienceIsPublished) return null;
  return show.experiencePublishedContent ?? null;
}
