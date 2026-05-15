/**
 * Banner feature — public API.
 *
 * CSS: import 'features/banner/banner.css' once at the root of any Banner
 * surface. All rules are scoped under [data-banner] so adding the CSS to
 * a non-Banner page is a no-op.
 */

export {
  bannerColors,
  bannerSpacing,
  bannerDurations,
  type BannerColorToken,
} from './tokens';

export {
  BANNER_GOOGLE_FONTS_HREF,
  BANNER_DISPLAY_FAMILY,
  BANNER_BODY_FAMILY,
  ensureBannerFontsLoaded,
} from './fonts';

export {
  useBannerBrandColor,
  deriveBannerBrandColors,
  type BannerBrandColors,
} from './hooks/useBannerBrandColor';

export {
  BannerFlagBar,
  type BannerFlagBarProps,
  type BannerFlagBarVariant,
} from './components/BannerFlagBar';

export {
  BannerSectionHead,
  type BannerSectionHeadProps,
} from './components/BannerSectionHead';

export {
  BannerContentRow,
  type BannerContentRowProps,
} from './components/BannerContentRow';

export { BannerLandingPage } from './landing/BannerLandingPage';
export { BannerEntryReceived, type BannerEntryReceivedProps } from './wizard/BannerEntryReceived';
export {
  BannerEntryBlankDocument,
  BannerEntryBlankButton,
  type BannerEntryBlankProps,
} from './entry-blank';
