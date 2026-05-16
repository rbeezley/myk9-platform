/**
 * Poster feature — public API.
 *
 * CSS: import 'features/poster/poster.css' once at the root of any Poster
 * surface. All rules are scoped under [data-poster] so adding the CSS to
 * a non-Poster page is a no-op.
 */

export {
  posterColors,
  posterSpacing,
  posterDurations,
  posterSquareRotation,
  type PosterColorToken,
} from './tokens';

export {
  POSTER_GOOGLE_FONTS_HREF,
  POSTER_DISPLAY_FAMILY,
  POSTER_DISPLAY_TIGHT_FAMILY,
  POSTER_BODY_FAMILY,
  POSTER_MONO_FAMILY,
  ensurePosterFontsLoaded,
} from './fonts';

export { PosterInkBlot, type PosterInkBlotProps } from './components/PosterInkBlot';
export {
  PosterRotatingSquare,
  type PosterRotatingSquareProps,
} from './components/PosterRotatingSquare';
export {
  PosterMonoStrip,
  type PosterMonoStripProps,
  type PosterMonoStripItem,
  type PosterMonoStripCta,
} from './components/PosterMonoStrip';
export {
  PosterHeading,
  type PosterHeadingProps,
  type PosterHeadingLevel,
  type PosterHeadingVariant,
} from './components/PosterHeading';
export {
  PosterSectionHead,
  type PosterSectionHeadProps,
} from './components/PosterSectionHead';
export {
  PosterTitleStack,
  type PosterTitleStackProps,
  type PosterTitleWord,
  type PosterTitleWordVariant,
} from './components/PosterTitleStack';

export { PosterLandingPage } from './landing/PosterLandingPage';
export { PosterEntryReceived } from './wizard/PosterEntryReceived';
export {
  PosterEntryBlankDocument,
  PosterEntryBlankButton,
  type PosterEntryBlankProps,
} from './entry-blank';
