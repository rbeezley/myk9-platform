/**
 * Monogram feature — public API.
 *
 * Phase 1 ships tokens, fonts, the embossed-letters primitive, and the
 * buildMonogram helper. Higher-level surfaces (landing page sections,
 * entry blank PDF, wizard completion) will live in sibling subdirectories
 * and ship in follow-up PRs.
 *
 * CSS: import 'features/monogram/monogram.css' once at the root of any
 * Monogram surface. All rules are scoped under [data-monogram] so adding
 * the CSS to a non-Monogram page is a no-op.
 */

export {
  monogramColors,
  monogramSpacing,
  monogramOrnaments,
  monogramDurations,
  type MonogramColorToken,
} from './tokens';

export {
  MONOGRAM_GOOGLE_FONTS_HREF,
  MONOGRAM_MONOGRAM_FAMILY,
  MONOGRAM_DISPLAY_FAMILY,
  MONOGRAM_BODY_FAMILY,
  ensureMonogramFontsLoaded,
} from './fonts';

export { MonogramEmboss, type MonogramEmbossProps } from './components/MonogramEmboss';

export { buildMonogram } from './utils/buildMonogram';
