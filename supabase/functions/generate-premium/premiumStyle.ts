/**
 * Style authority (migration 195+): shows.style is the single source of truth for all four
 * experience touchpoints. The edge runtime cannot import the app's `getShowStyle`
 * (`apps/myk9show/src/features/registries/helpers.ts`), so this mirrors its normalization: the
 * same eight styles, 'default' read as 'monogram', and anything unknown as 'monogram'. The
 * generator adds two steps of its own: a show with no style takes its club template's, and
 * pre-migration-191 names are remapped. premiumStyle.test.ts pins the style list to the app's.
 *
 * MYK9-2056: the generator's shows select must name `style`, or every premium falls back to the
 * template's style (SHOW_STYLE_COLUMN is read by that select and pinned by a test).
 */
export const SHOW_STYLE_COLUMN = 'style';

export const PREMIUM_STYLES = [
  'monogram',
  'banner',
  'headline',
  'magazine',
  'poster',
  'gazette',
  'fieldGuide',
  'heritage',
] as const;

const KNOWN = new Set<string>(PREMIUM_STYLES);

const LEGACY_STYLE_REMAP: Record<string, string> = {
  classic: 'monogram',
  modern: 'banner',
  minimal: 'headline',
  default: 'monogram',
};

export function resolvePremiumStyle(
  showStyle: string | null | undefined,
  templateStyle: string | null | undefined
): string {
  const raw = showStyle || templateStyle || 'monogram';
  const mapped = LEGACY_STYLE_REMAP[raw] ?? raw;
  return KNOWN.has(mapped) ? mapped : 'monogram';
}
