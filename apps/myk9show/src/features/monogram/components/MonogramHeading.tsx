import { type JSX, type ReactNode } from 'react';
import { MONOGRAM_DISPLAY_FAMILY } from '../fonts';
import { monogramColors } from '../tokens';

type HeadingLevel = 1 | 2 | 3 | 4;

export interface MonogramHeadingProps {
  /** Semantic heading level (1–4). Maps to <h1>–<h4>. */
  level: HeadingLevel;
  /** Heading content. Wrap accent fragments in <span className="italic">…</span>
   *  to pick up the bronze italic styling defined in monogram.css. */
  children: ReactNode;
  /** Render as italic + bronze in full. Used for hero titles where the whole
   *  display string is the accent (not just a span fragment). */
  italic?: boolean;
  /** Optional override font size (px). Defaults to a level-appropriate value. */
  size?: number;
  /** Optional className for layout positioning. Color and font come from inline
   *  styles + the parent [data-monogram] scope. */
  className?: string;
}

const DEFAULT_SIZES: Record<HeadingLevel, number> = {
  1: 88,
  2: 44,
  3: 28,
  4: 22,
};

/**
 * Monogram display heading — Bodoni Moda, optionally italic + bronze.
 *
 * Mirrors the visual treatment of `.mg-section__title` / `.mg-twocol__heading`
 * from the design handoff: tight letter-spacing, line-height 1.1, regular
 * weight (Bodoni's display character carries the gravitas at large sizes).
 *
 * Children may include `<span className="italic">…</span>` fragments — those
 * pick up the bronze italic styling from monogram.css (`.mg-heading .italic`).
 */
export function MonogramHeading({
  level,
  children,
  italic,
  size,
  className,
}: MonogramHeadingProps): JSX.Element {
  const Tag = `h${level}` as const;
  const style: React.CSSProperties = {
    fontFamily: MONOGRAM_DISPLAY_FAMILY,
    fontWeight: 400,
    fontSize: size ?? DEFAULT_SIZES[level],
    lineHeight: 1.1,
    letterSpacing: '-0.015em',
    color: italic ? monogramColors.bronze : monogramColors.ink,
    fontStyle: italic ? 'italic' : 'normal',
    margin: 0,
  };

  return (
    <Tag className={`mg-heading ${className ?? ''}`.trim()} style={style}>
      {children}
    </Tag>
  );
}
