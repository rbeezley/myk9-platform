/**
 * Gazette feature — public API.
 *
 * Gazette ports the small-town-broadsheet visual register across landing
 * page, wizard receipt, mail-in entry blank PDF, and confirmation email.
 *
 * CSS: import 'features/gazette/gazette.css' once at the root of any
 * Gazette surface (landing page, wizard receipt). Styles are scoped under
 * `[data-gazette]` so adding the CSS to a non-Gazette page is a no-op.
 *
 * Motion + reveal hooks are reused from Heritage rather than re-implemented —
 * the bare-bones primitives (useReducedMotion, useRevealOnScroll, useCountdown)
 * are style-agnostic.
 */

export {
  gazetteColors,
  gazetteSpacing,
  gazetteTypography,
  gazetteDurations,
  gazetteFolios,
  gazetteSectionLetters,
  gazetteSectionLetter,
  GAZETTE_DEFAULT_VOLUME_ROMAN,
  GAZETTE_DEFAULT_EDITION,
  GAZETTE_DEFAULT_MOTTO,
  type GazetteColorToken,
} from './tokens';

export {
  GAZETTE_GOOGLE_FONTS_HREF,
  GAZETTE_DISPLAY_FAMILY,
  GAZETTE_BODY_FAMILY,
  GAZETTE_META_FAMILY,
  ensureGazetteFontsLoaded,
} from './fonts';

export { GazetteHeading } from './components/GazetteHeading';
export { GazetteMasthead } from './components/GazetteMasthead';
export { GazetteDropCap } from './components/GazetteDropCap';
export { GazetteClassifiedBox } from './components/GazetteClassifiedBox';
export { GazetteSectionHead } from './components/GazetteSectionHead';
export { GazetteDoubleRule } from './components/GazetteDoubleRule';
