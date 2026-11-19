import type { GeneratedPremium } from '@/types/premium-types';

/** The shows.max_total_entries value as a positive whole number, or null (no limit). */
export function normalizeEntryLimit(value: unknown): number | null {
  const n = typeof value === 'string' ? Number.parseInt(value, 10) : value;
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * MYK9-2220: the one plain line a UKC or ASCA (§1.5.12, 1.5.14) premium prints about the show's total entry limit, or null
 * (no line in any style) when the show has no limit or the premium is not UKC. Every UKC style
 * renders this string through the premium facts, so the styles cannot disagree.
 */
export function premiumEntryLimitText(
  premium: Pick<GeneratedPremium, 'org'> & {
    show: Pick<GeneratedPremium['show'], 'maxTotalEntries'>;
  }
): string | null {
  if (premium.org !== 'UKC' && premium.org !== 'ASCA') return null;
  const limit = normalizeEntryLimit(premium.show.maxTotalEntries);
  if (limit === null) return null;
  // An entry is one dog in one class, so the limit counts entries, not dogs.
  return `Total entry limit: ${limit} ${limit === 1 ? 'entry' : 'entries'}.`;
}

/**
 * MYK9-2229: the line a trial with its own entry limit (trials.max_total_entries) prints beside
 * that trial in every style and registry, or null when the trial has none. It does not depend on
 * the show's limit or the registry: a trial cap is a fact about that trial.
 */
export function premiumTrialEntryLimitText(
  trial: Pick<GeneratedPremium['trials'][number], 'maxTotalEntries'>
): string | null {
  const limit = normalizeEntryLimit(trial.maxTotalEntries);
  if (limit === null) return null;
  return `Trial entry limit: ${limit} ${limit === 1 ? 'entry' : 'entries'}.`;
}
