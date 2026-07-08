export type PremiumPublishState = 'unpublished' | 'published-current' | 'published-stale';

export interface PremiumPublishStateInput {
  publishedPremiumUrl?: string | null | undefined;
  publishedPremiumAt?: string | null | undefined;
  updatedAt?: string | null | undefined;
}

export const PREMIUM_STALE_TOLERANCE_MS = 5_000;

function hasText(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

function isStale(input: PremiumPublishStateInput): boolean {
  if (!input.updatedAt || !input.publishedPremiumAt) return false;
  const updatedAt = new Date(input.updatedAt).getTime();
  const publishedAt = new Date(input.publishedPremiumAt).getTime();
  if (!Number.isFinite(updatedAt) || !Number.isFinite(publishedAt)) return false;
  return updatedAt - publishedAt > PREMIUM_STALE_TOLERANCE_MS;
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
