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
  /**
   * MYK9-2230: the premium as published, so a copy-only republish from Edit show starts from every
   * fact it printed (address, trial limits, officers) and overlays only what the form edits.
   * Absent on a snapshot published before it.
   */
  premium?: GeneratedPremium;
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
    ...(isFullPremium(premium) ? { premium } : {}),
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

function isFullPremium(premium: object): premium is GeneratedPremium {
  const p = premium as Partial<GeneratedPremium>;
  return Boolean(p.org && p.show && p.club && p.trials);
}
