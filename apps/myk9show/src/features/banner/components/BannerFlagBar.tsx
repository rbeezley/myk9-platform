import { type JSX, type ReactNode } from 'react';
import { BANNER_BODY_FAMILY, BANNER_DISPLAY_FAMILY } from '../fonts';
import { bannerSpacing } from '../tokens';

export type BannerFlagBarVariant = 'masthead' | 'final';

export interface BannerFlagBarProps {
  /** "masthead" (top of page, large) or "final" (bottom CTA band, dark). */
  variant: BannerFlagBarVariant;
  /** The flag color hex. Required — no default so callers always go through
   *  `useBannerBrandColor` and get the matching `textColor`. */
  color: string;
  /** Computed text color (#ffffff or #111111) from luminance threshold. */
  textColor: string;
  /** Optional deeper sibling for the final-band dark surface. Defaults to
   *  `color` if not supplied. */
  colorDeep?: string;
  /** Bar contents. */
  children: ReactNode;
}

/**
 * The signature element of the Banner style — a full-bleed colored bar
 * that brackets the page. Masthead variant carries the show identity at
 * the top; final variant closes the page with a dark CTA band.
 *
 * No animation here. Animation is hooked at the section level via the
 * shared `useRevealOnScroll` and `.bn-reveal` CSS — the bar itself is a
 * static rectangle on purpose.
 *
 * Color comes from the parent via `useBannerBrandColor`. Per-club brand
 * colors flow through this component as plain `style` props; the CSS-var
 * mechanism on the `[data-banner]` root is also set so descendants can
 * read `var(--bn-flag)` without prop-drilling.
 */
export function BannerFlagBar({
  variant,
  color,
  textColor,
  colorDeep,
  children,
}: BannerFlagBarProps): JSX.Element {
  const isFinal = variant === 'final';
  // Final variant uses the deeper sibling as background; masthead uses
  // the brand flag directly. The "dark band closes the page" intent in
  // the design handoff is preserved this way for clubs whose flag is
  // already darker.
  const background = isFinal ? (colorDeep ?? color) : color;

  return (
    <section
      className={isFinal ? 'bn-flag bn-flag--final' : 'bn-flag bn-flag--masthead'}
      style={{
        background,
        color: textColor,
        padding: `${bannerSpacing.flagPaddingY}px ${bannerSpacing.pageGutterX}px`,
        fontFamily: BANNER_BODY_FAMILY,
      }}
    >
      <div
        style={{
          maxWidth: bannerSpacing.contentMax,
          margin: '0 auto',
          fontFamily: isFinal ? BANNER_DISPLAY_FAMILY : BANNER_BODY_FAMILY,
        }}
      >
        {children}
      </div>
    </section>
  );
}
