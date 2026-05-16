import { type CSSProperties, type JSX, type ReactNode } from 'react';
import { POSTER_DISPLAY_FAMILY } from '../fonts';
import { posterColors } from '../tokens';

export type PosterHeadingLevel = 'h1' | 'h2' | 'h3';
export type PosterHeadingVariant = 'solid' | 'outline' | 'red' | 'olive' | 'cream';

export interface PosterHeadingProps {
  /** Semantic heading level. Defaults to 'h2'. */
  as?: PosterHeadingLevel;
  /** Color/treatment variant. Defaults to 'solid' (ink). */
  variant?: PosterHeadingVariant;
  /** Font size in px. Falls back to a sensible default per heading level. */
  size?: number;
  /** Letter spacing override. Defaults to -0.035em. */
  letterSpacing?: string;
  /** Line height override. Defaults to 0.88. */
  lineHeight?: number;
  /** Optional className. */
  className?: string;
  /** Optional inline style overrides — merged after the variant defaults. */
  style?: CSSProperties;
  children: ReactNode;
}

const DEFAULT_SIZE_BY_LEVEL: Record<PosterHeadingLevel, number> = {
  h1: 168,
  h2: 96,
  h3: 56,
};

/**
 * Poster display heading — Archivo Black at scale.
 *
 * The Poster identity collapses if Archivo Black is rendered too small or
 * in the wrong color, so this primitive enforces:
 *   - Never below 18px (clamped via Math.max).
 *   - Never used for body copy (no `body` variant).
 *
 * Variants:
 *   - solid: ink (default)
 *   - red:   the hero accent
 *   - olive: dark modulator
 *   - cream: white-on-dark contexts
 *   - outline: `-webkit-text-stroke` outlined text. Webkit/Blink only;
 *     Firefox renders as solid (acceptable degradation per design notes).
 *
 * Use the `outline` variant exactly once per major section as a graphic
 * accent — it loses meaning if repeated.
 */
export function PosterHeading({
  as = 'h2',
  variant = 'solid',
  size,
  letterSpacing = '-0.035em',
  lineHeight = 0.88,
  className,
  style,
  children,
}: PosterHeadingProps): JSX.Element {
  const Tag = as;
  const fontSize = Math.max(18, size ?? DEFAULT_SIZE_BY_LEVEL[as]);

  const variantStyle: CSSProperties = (() => {
    switch (variant) {
      case 'red':
        return { color: posterColors.red };
      case 'olive':
        return { color: posterColors.olive };
      case 'cream':
        return { color: posterColors.cream };
      case 'outline':
        return {
          color: 'transparent',
          WebkitTextStroke: `3px ${posterColors.ink}`,
        };
      case 'solid':
      default:
        return { color: posterColors.ink };
    }
  })();

  return (
    <Tag
      className={className}
      style={{
        fontFamily: POSTER_DISPLAY_FAMILY,
        fontWeight: 400,
        fontSize,
        letterSpacing,
        lineHeight,
        margin: 0,
        ...variantStyle,
        ...style,
      }}
    >
      {children}
    </Tag>
  );
}
