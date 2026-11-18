import type { ShowStyle } from '@/features/registries';
import {
  premiumRecordingFeeText,
  type PremiumRecordingFeeDocument,
} from '@/features/premium/premiumRecordingFeeStatement';
import type { GeneratedPremium, PremiumSupplemental } from '@/types/premium-types';

export interface ShowExperienceSnapshot {
  style: ShowStyle;
  generatedAt: string;
  narratives: GeneratedPremium['narratives'];
  supplemental: PremiumSupplemental;
  /**
   * MYK9-2044: the recording fee statement the published premium PDF prints, derived from the same
   * premium, so the public page states the same words. Null when the premium states none; absent
   * on a snapshot published before it, which shows no line.
   */
  recordingFee?: string | null;
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
  premium: Pick<GeneratedPremium, 'style' | 'narratives' | 'supplemental'> &
    PremiumRecordingFeeDocument;
  premiumPath: string | null;
  premiumUrl: string;
  publishedAt?: string;
}): ShowExperienceSnapshot {
  return {
    style: premium.style,
    generatedAt: publishedAt ?? '',
    narratives: premium.narratives,
    supplemental: premium.supplemental,
    recordingFee: premiumRecordingFeeText(premium),
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
