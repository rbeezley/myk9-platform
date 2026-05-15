/**
 * Monogram feature — public API.
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
export { MonogramHeading, type MonogramHeadingProps } from './components/MonogramHeading';
export {
  MonogramSectionFolio,
  toLowerRoman,
  type MonogramSectionFolioProps,
} from './components/MonogramSectionFolio';
export {
  MonogramJudgeCard,
  type MonogramJudgeCardProps,
} from './components/MonogramJudgeCard';

export { MonogramLandingPage } from './landing/MonogramLandingPage';

export { buildMonogram } from './utils/buildMonogram';
