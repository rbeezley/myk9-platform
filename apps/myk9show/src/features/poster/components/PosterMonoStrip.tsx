import { type JSX, type ReactNode } from 'react';
import { POSTER_MONO_FAMILY } from '../fonts';
import { posterColors, posterSpacing } from '../tokens';

export interface PosterMonoStripItem {
  /** Visible label, e.g. "12—14 JUN" or "281 / 360 CLAIMED". */
  label: string;
  /** Optional separator dot color. Defaults to red. */
  sepColor?: string;
}

export interface PosterMonoStripCta {
  label: string;
  href: string;
}

export interface PosterMonoStripProps {
  /** Items rendered left-to-right with red bullet separators between them. */
  items: PosterMonoStripItem[];
  /** Optional right-aligned CTA chip. */
  cta?: PosterMonoStripCta;
  /** Background color. Defaults to ink. */
  background?: string;
  /** Foreground color. Defaults to cream. */
  foreground?: string;
  /** Optional className for sticky/positioning overrides. */
  className?: string;
  /** Optional ARIA label for the strip; defaults to "Trial header". */
  ariaLabel?: string;
  /** Optional content rendered after the items (e.g. links). */
  children?: ReactNode;
}

/**
 * The Poster mono running strip — the ink-on-cream band that brackets the
 * page (top + bottom). Ten-pixel mono in IBM Plex tracked tight at 0.04em
 * (NOT 0.32em, which is what other premium styles use for kickers).
 *
 * Renders a flex strip with items separated by red bullet dots. Optional
 * right-aligned CTA chip in red.
 *
 * The strip wraps `nowrap` and clips overflow — on narrow viewports the
 * later items disappear off-edge rather than wrapping. Mobile breakpoint
 * collapses the items count via the `.po-strip-item--hide-narrow` class.
 */
export function PosterMonoStrip({
  items,
  cta,
  background = posterColors.ink,
  foreground = posterColors.cream,
  className,
  ariaLabel = 'Trial header',
  children,
}: PosterMonoStripProps): JSX.Element {
  return (
    <div
      role="banner"
      aria-label={ariaLabel}
      className={`po-strip ${className ?? ''}`.trim()}
      style={{
        background,
        color: foreground,
        padding: `${posterSpacing.monoStripPaddingY}px ${posterSpacing.monoStripPaddingX}px`,
        fontFamily: POSTER_MONO_FAMILY,
        fontWeight: 500,
        fontSize: 11,
        letterSpacing: '0.04em',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        gap: 32,
      }}
    >
      <div style={{ display: 'flex', gap: 32, alignItems: 'center', overflow: 'hidden' }}>
        {items.map((item, i) => (
          <span
            key={`${item.label}-${i}`}
            className={
              i >= 2 ? 'po-strip-item po-strip-item--hide-narrow' : 'po-strip-item'
            }
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            {i > 0 && (
              <span
                aria-hidden
                style={{ color: item.sepColor ?? posterColors.red, fontWeight: 600 }}
              >
                ●
              </span>
            )}
            {item.label}
          </span>
        ))}
        {children}
      </div>
      {cta && (
        <a
          href={cta.href}
          style={{
            background: posterColors.red,
            color: foreground,
            padding: '4px 12px',
            fontFamily: POSTER_MONO_FAMILY,
            fontWeight: 500,
            fontSize: 11,
            letterSpacing: '0.04em',
            textDecoration: 'none',
            transition: 'background 200ms',
            flexShrink: 0,
          }}
        >
          {cta.label}
        </a>
      )}
    </div>
  );
}
