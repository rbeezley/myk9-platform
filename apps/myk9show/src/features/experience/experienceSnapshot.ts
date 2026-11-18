import type { ShowStyle } from '@/features/registries';
import type { GeneratedPremium, PremiumSupplemental } from '@/types/premium-types';

export interface ShowExperienceSnapshot {
  style: ShowStyle;
  generatedAt: string;
  narratives: GeneratedPremium['narratives'];
  supplemental: PremiumSupplemental;
  /**
   * MYK9-2044: the recording fee statement the published premium PDF prints, so the public page
   * states the same words. Absent on a snapshot published before it, which shows no line.
   */
  recordingFee?: GeneratedPremium['recordingFee'];
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
  premium: Pick<GeneratedPremium, 'style' | 'narratives' | 'supplemental' | 'recordingFee'>;
  premiumPath: string | null;
  premiumUrl: string;
  publishedAt?: string;
}): ShowExperienceSnapshot {
  return {
    style: premium.style,
    generatedAt: publishedAt ?? '',
    narratives: premium.narratives,
    supplemental: premium.supplemental,
    recordingFee: premium.recordingFee ?? null,
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
