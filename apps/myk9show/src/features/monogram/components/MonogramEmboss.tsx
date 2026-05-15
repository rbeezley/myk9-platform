import { useEffect, useState, type JSX } from 'react';
import { monogramColors } from '../tokens';

export interface MonogramEmbossProps {
  /** Pre-computed initials (e.g. from buildMonogram). 1–3 chars. */
  letters: string;
  /** Font size in px. Handoff sizes: 32 (nav), 64 (judge), 96 (footer),
   *  280 (welcome aside), 580 (final CTA dark), 640 (hero bleed). */
  size: number;
  /** "embossed" (gradient + layered shadows) or "solid" (single color, flat). */
  variant?: 'embossed' | 'solid';
  /** Color for solid variant. Defaults to monogramColors.ink. */
  solidColor?: string;
  /** Embossed background — "paper" (default) or "dark" (for dark bands). */
  surface?: 'paper' | 'dark';
  /** ARIA visibility. Defaults true (decorative). Set false if the monogram
   *  carries semantic meaning at the call site. */
  ariaHidden?: boolean;
  /** Optional className for layout (positioning, line-height overrides). */
  className?: string;
}

/**
 * Feature-detect whether the current browser supports
 * `background-clip: text`. JSDOM (and ancient browsers) report `false`, in
 * which case `MonogramEmboss` falls back to solid color so the letters
 * remain visible. Mirrors the @supports rule in monogram.css.
 *
 * Defaults to `false` (assume unsupported until proven otherwise) so the
 * first render shows solid letters. Supporting browsers upgrade to embossed
 * on the next render once the effect runs. The inverse default would briefly
 * show invisible text on non-supporting browsers (`color: transparent` from
 * the embossed-paper style block, applied before the fallback kicks in) —
 * a worse failure mode than a single frame of solid-color flash.
 */
function useSupportsBackgroundClipText(): boolean {
  const [supports, setSupports] = useState<boolean>(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.CSS || !window.CSS.supports) {
      return;
    }
    setSupports(
      window.CSS.supports('-webkit-background-clip', 'text') ||
        window.CSS.supports('background-clip', 'text')
    );
  }, []);
  return supports;
}

const EMBOSS_PAPER: React.CSSProperties = {
  color: 'transparent',
  background: 'linear-gradient(180deg, #ece5d4 0%, #f3eee4 50%, #d8cfb8 100%)',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  textShadow: [
    '1px 1px 0 rgba(255, 252, 240, 0.95)',
    '-1px -1px 0 rgba(28, 24, 21, 0.18)',
    '2px 2px 4px rgba(28, 24, 21, 0.12)',
    '-2px -2px 4px rgba(255, 252, 240, 0.55)',
  ].join(', '),
  filter: 'drop-shadow(0 2px 1px rgba(28, 24, 21, 0.08))',
};

const EMBOSS_DARK: React.CSSProperties = {
  color: 'transparent',
  background: 'linear-gradient(180deg, #2a241e 0%, #1c1815 50%, #0f0c09 100%)',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  textShadow: ['1px 1px 0 rgba(255, 252, 240, 0.04)', '-1px -1px 0 rgba(0, 0, 0, 0.6)'].join(', '),
};

/**
 * The signature element of the Monogram style — letterpress-emboss initials
 * achieved via `background-clip: text` over a paper-tone gradient with
 * layered text-shadows. Falls back to solid color when the browser doesn't
 * support background-clip:text (older IE, JSDOM, some email previews).
 *
 * Render contexts on the landing page:
 * - Hero bleed centerpiece: size=640, variant="embossed", surface="paper"
 * - Welcome aside: size=280, variant="embossed", surface="paper"
 * - Judge card: size=64, variant="solid", solidColor={monogramColors.bronze}
 * - Final CTA band: size=580, variant="embossed", surface="dark"
 * - Footer: size=96, variant="solid"
 * - Sticky nav inline: size=32, variant="solid"
 */
export function MonogramEmboss({
  letters,
  size,
  variant = 'embossed',
  solidColor = monogramColors.ink,
  surface = 'paper',
  ariaHidden = true,
  className,
}: MonogramEmbossProps): JSX.Element {
  const supportsBackgroundClip = useSupportsBackgroundClipText();
  const useEmboss = variant === 'embossed' && supportsBackgroundClip;

  const fontFamily = "'Italiana', 'Bodoni Moda', Georgia, serif";
  const baseStyle: React.CSSProperties = {
    display: 'inline-block',
    fontFamily,
    fontSize: size,
    lineHeight: 1,
    letterSpacing: '0.04em',
  };

  const variantStyle: React.CSSProperties = useEmboss
    ? surface === 'dark'
      ? EMBOSS_DARK
      : EMBOSS_PAPER
    : { color: solidColor };

  return (
    <span aria-hidden={ariaHidden} className={className} style={{ ...baseStyle, ...variantStyle }}>
      {letters || '?'}
    </span>
  );
}
