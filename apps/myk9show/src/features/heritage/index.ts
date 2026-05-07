/**
 * Heritage feature — public API.
 *
 * Phase 1 ships tokens, fonts, motion hooks, and four primitives. Higher-level
 * surfaces (landing page sections, entry blank PDF, confirmation email,
 * wizard completion) live in sibling subdirectories that import from here.
 *
 * CSS: import 'features/heritage/heritage.css' once at the root of any
 * Heritage surface (landing page, wizard completion). Styles are scoped under
 * `[data-heritage]` so adding the CSS to a non-Heritage page is a no-op.
 */

export {
  heritageColors,
  heritageSpacing,
  heritageOrnaments,
  heritageDurations,
  type HeritageColorToken,
} from './tokens';

export {
  HERITAGE_GOOGLE_FONTS_HREF,
  HERITAGE_DISPLAY_FAMILY,
  HERITAGE_BODY_FAMILY,
  ensureHeritageFontsLoaded,
} from './fonts';

export { useReducedMotion } from './hooks/useReducedMotion';
export { useRevealOnScroll } from './hooks/useRevealOnScroll';

export { HeritageOrnamentRule } from './components/HeritageOrnamentRule';
export { HeritageSectionFolio } from './components/HeritageSectionFolio';
export { HeritageEngravedFrame } from './components/HeritageEngravedFrame';
export { HeritageHeading } from './components/HeritageHeading';
