import type { GeneratedPremium } from '@/types/premium-types';

/** The shows.max_total_entries value as a positive whole number, or null (no limit). */
export function normalizeEntryLimit(value: unknown): number | null {
  const n = typeof value === 'string' ? Number.parseInt(value, 10) : value;
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * MYK9-2220: the one plain line a UKC premium prints about the show's total entry limit, or null
 * (no line in any style) when the show has no limit or the premium is not UKC. Every UKC style
 * renders this string through the premium facts, so the styles cannot disagree.
 */
export function premiumEntryLimitText(
  premium: Pick<GeneratedPremium, 'org'> & {
    show: Pick<GeneratedPremium['show'], 'maxTotalEntries'>;
  }
): string | null {
  if (premium.org !== 'UKC') return null;
  const limit = normalizeEntryLimit(premium.show.maxTotalEntries);
  if (limit === null) return null;
  return `Entries are limited to ${limit} ${limit === 1 ? 'dog' : 'dogs'} in total.`;
}
