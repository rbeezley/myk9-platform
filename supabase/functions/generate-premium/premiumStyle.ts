/**
 * Style authority (migration 195+): shows.style is the single source of truth for all four
 * experience touchpoints. A show with no style of its own falls back to its club template's,
 * then to 'monogram', and pre-migration-191 legacy names are remapped so clients never receive
 * an unknown key.
 *
 * MYK9-2056: the generator's shows select must name `style`, or every premium falls back to the
 * template's style (SHOW_STYLE_COLUMN is read by that select and pinned by a test).
 */
export const SHOW_STYLE_COLUMN = 'style';

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
  return LEGACY_STYLE_REMAP[raw] ?? raw;
}
