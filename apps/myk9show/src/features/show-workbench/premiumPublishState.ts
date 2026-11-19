export type PremiumPublishState = 'unpublished' | 'published-current' | 'published-stale';

export interface PremiumPublishStateInput {
  publishedPremiumUrl?: string | null | undefined;
  publishedPremiumAt?: string | null | undefined;
  updatedAt?: string | null | undefined;
  /** MYK9-2201: when the secretary last saved premium narrative/supplemental edits. */
  contentDraftAt?: string | null | undefined;
}

export const PREMIUM_STALE_TOLERANCE_MS = 5_000;

function hasText(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

function isNewerThanPublished(
  changedAt: string | null | undefined,
  publishedPremiumAt: string | null | undefined
): boolean {
  if (!changedAt || !publishedPremiumAt) return false;
  const changed = new Date(changedAt).getTime();
  const publishedAt = new Date(publishedPremiumAt).getTime();
  if (!Number.isFinite(changed) || !Number.isFinite(publishedAt)) return false;
  return changed - publishedAt > PREMIUM_STALE_TOLERANCE_MS;
}

// A saved premium draft newer than the PDF is stale on its own: the draft is what Republish
// premium publishes (MYK9-2201).
function isStale(input: PremiumPublishStateInput): boolean {
  return (
    isNewerThanPublished(input.updatedAt, input.publishedPremiumAt) ||
    isNewerThanPublished(input.contentDraftAt, input.publishedPremiumAt)
  );
}

export function classifyPremiumPublishState(input: PremiumPublishStateInput): PremiumPublishState {
  if (!hasText(input.publishedPremiumUrl) || !hasText(input.publishedPremiumAt)) {
    return 'unpublished';
  }
  return isStale(input) ? 'published-stale' : 'published-current';
}

export function isPremiumPublished(input: PremiumPublishStateInput): boolean {
  return classifyPremiumPublishState(input) !== 'unpublished';
}
