/**
 * Stripe reserves the account prefix and the `* ` separator inside the
 * statement descriptor's 22-character limit. A 10-character suffix is safe
 * for the maximum 10-character prefix configured by Stripe.
 */
const MAX_SUFFIX_LENGTH = 10;
const FALLBACK_SUFFIX = 'MYK9SHOW';

export function formatStatementDescriptorSuffix(name: string | null | undefined): string {
  const normalized = (name ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[<>'"\\*]/g, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/ +/g, ' ');

  if (!normalized || !/[A-Z]/.test(normalized)) {
    return FALLBACK_SUFFIX;
  }

  if (normalized.length <= MAX_SUFFIX_LENGTH) {
    return normalized;
  }

  const words = normalized.split(' ');
  if (words[0].length > MAX_SUFFIX_LENGTH && words.length > 1) {
    const abbreviation = words
      .map(word => word[0])
      .join('')
      .slice(0, MAX_SUFFIX_LENGTH);
    return /[A-Z]/.test(abbreviation) ? abbreviation : FALLBACK_SUFFIX;
  }

  let suffix = '';
  for (const word of words) {
    const candidate = suffix ? `${suffix} ${word}` : word;
    if (candidate.length > MAX_SUFFIX_LENGTH) {
      break;
    }
    suffix = candidate;
  }

  if (suffix && /[A-Z]/.test(suffix)) {
    return suffix;
  }

  const abbreviation = words
    .map(word => word[0])
    .join('')
    .slice(0, MAX_SUFFIX_LENGTH);
  if (/[A-Z]/.test(abbreviation)) {
    return abbreviation;
  }

  // A single long word has no word boundary to preserve. The fixed budget
  // keeps it valid while retaining the most recognizable part of the name.
  const truncated = normalized.slice(0, MAX_SUFFIX_LENGTH);
  return /[A-Z]/.test(truncated) ? truncated : FALLBACK_SUFFIX;
}
