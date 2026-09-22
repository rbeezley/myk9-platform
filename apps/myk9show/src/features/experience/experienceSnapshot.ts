import type { ShowStyle } from '@/features/registries';
import type { GeneratedPremium, PremiumSupplemental } from '@/types/premium-types';

export interface ShowExperienceSnapshot {
  style: ShowStyle;
  generatedAt: string;
  narratives: GeneratedPremium['narratives'];
  supplemental: PremiumSupplemental;
  outputs: {
    /** New snapshots persist both values committed together by PostgreSQL. */
    premiumPath?: string | null;
    /** Legacy snapshots may still carry a URL from before MYK9-694. */
    premiumUrl?: string | null;
  };
}

export function buildExperienceSnapshot({
  premium,
  premiumPath,
  premiumUrl,
  publishedAt,
}: {
  premium: Pick<GeneratedPremium, 'style' | 'narratives' | 'supplemental'>;
  premiumPath: string | null;
  premiumUrl: string;
  publishedAt?: string;
}): ShowExperienceSnapshot {
  return {
    style: premium.style,
    generatedAt: publishedAt ?? '',
    narratives: premium.narratives,
    supplemental: premium.supplemental,
    outputs: { premiumPath, premiumUrl },
  };
}

export function getLiveExperienceSnapshot(show: {
  experienceIsPublished?: boolean;
  experiencePublishedContent?: ShowExperienceSnapshot | null;
}): ShowExperienceSnapshot | null {
  if (!show.experienceIsPublished) return null;
  return show.experiencePublishedContent ?? null;
}
