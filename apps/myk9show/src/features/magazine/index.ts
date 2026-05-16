/**
 * Magazine feature — public API.
 *
 * Magazine is an editorial-spread premium style: oversized italic Cormorant
 * Garamond display, warm gold gradient hairlines, drop-cap multi-column body,
 * pull quotes, and 4:5 feature-photograph slots that fall back to a gradient
 * placeholder when no image has been uploaded.
 *
 * CSS: import 'features/magazine/magazine.css' once at the root of any
 * Magazine surface. Styles are scoped under `[data-magazine]` so adding the
 * import on a non-Magazine page is a no-op.
 *
 * This barrel exposes only what other features need (primitives, tokens,
 * font helpers, motion hooks). Landing/wizard/entry-blank/email surfaces
 * live in sibling subdirectories that import from here.
 */

export {
  magazineColors,
  magazineGradients,
  magazineTypography,
  magazineDurations,
  magazineSpacing,
  type MagazineColorToken,
  type MagazineGradientToken,
} from './tokens';

export {
  MAGAZINE_GOOGLE_FONTS_HREF,
  MAGAZINE_DISPLAY_FAMILY,
  MAGAZINE_BODY_FAMILY,
  MAGAZINE_META_FAMILY,
  ensureMagazineFontsLoaded,
} from './fonts';

export { useReducedMotion } from './hooks/useReducedMotion';
export { useRevealOnScroll } from './hooks/useRevealOnScroll';
export { useCountdown, type CountdownValue } from './hooks/useCountdown';

export { MagazineHeading } from './components/MagazineHeading';
export { MagazineSectionFolio } from './components/MagazineSectionFolio';
export { MagazineGoldRule } from './components/MagazineGoldRule';
export { MagazineDropCap } from './components/MagazineDropCap';
export { MagazinePullQuote } from './components/MagazinePullQuote';
export { MagazineCover } from './components/MagazineCover';
export { MagazineJudgePortrait } from './components/MagazineJudgePortrait';
