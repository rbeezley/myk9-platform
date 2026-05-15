/**
 * Derive monogram initials from a club name.
 *
 * Examples:
 *   "Bexar County Kennel Club"   → "BCK"
 *   "Bexar County"               → "BC"
 *   "Monadnock"                  → "M"
 *   ""                           → "?"
 *
 * Mirrors the inline derivation in
 * supabase/functions/send-confirmation-email/index.ts and the original
 * buildMonogram() in features/premium/pdf/pdfStyles.ts. Kept here so any
 * Monogram surface (wizard, landing, entry blank) can share one source.
 */
export function buildMonogram(name: string | null | undefined, maxLetters = 3): string {
  if (!name) return '?';
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  return words
    .slice(0, maxLetters)
    .map(w => w[0]!.toUpperCase())
    .join('');
}
