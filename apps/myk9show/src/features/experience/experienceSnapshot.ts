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

/**
 * MYK9-2285: reads `shows.experience_published_content`. The column is NOT NULL with a `'{}'`
 * default, so a show that never published (or was unpublished) holds an empty object, not null.
 * That empty object is no snapshot; treating it as one handed the premium editor a draft with no
 * narratives, and its first render threw.
 */
export function readExperienceSnapshot(raw: unknown): ShowExperienceSnapshot | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  if (Object.keys(raw).length === 0) return null;
  return raw as ShowExperienceSnapshot;
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
