import { type CSSProperties, type JSX, type ReactNode } from 'react';
import { FIELD_GUIDE_DISPLAY_FAMILY } from '../fonts';
import { fieldGuideColors } from '../tokens';

export type FieldGuideHeadingLevel = 'h1' | 'h2' | 'h3';

export interface FieldGuideHeadingProps {
  /** Semantic heading level. Sizes default by level but can be overridden. */
  level?: FieldGuideHeadingLevel;
  /** Override the px font-size when the default-by-level isn't right. */
  size?: number;
  /** Optional sub-line rendered below the heading in mono-orange. */
  subtitle?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}

/**
 * FieldGuideHeading — IBM Plex Sans 700 with tight tracking. Defaults by
 * level: h1 = 56px (hero), h2 = 28px (section), h3 = 22px (sub-section).
 *
 * The optional subtitle is the small mono-orange descender that sits under
 * the hero title (e.g. "FIELD GUIDE · BCKC.2026.SS · REV 04"). It's
 * decorative — keep it short and uppercase-ish.
 */
const SIZE_BY_LEVEL: Record<FieldGuideHeadingLevel, number> = {
  h1: 56,
  h2: 28,
  h3: 22,
};

export function FieldGuideHeading({
  level = 'h1',
  size,
  subtitle,
  children,
  style,
}: FieldGuideHeadingProps): JSX.Element {
  const Tag = level;
  const px = size ?? SIZE_BY_LEVEL[level];

  return (
    <Tag
      className={`fg-heading fg-heading--${level}`}
      style={{
        margin: 0,
        fontFamily: FIELD_GUIDE_DISPLAY_FAMILY,
        fontWeight: 700,
        fontSize: px,
        letterSpacing: px >= 40 ? '-0.025em' : '-0.02em',
        lineHeight: px >= 40 ? 1.0 : 1.1,
        color: fieldGuideColors.ink,
        ...style,
      }}
    >
      {children}
      {subtitle != null && (
        <span
          style={{
            display: 'block',
            marginTop: 8,
            fontFamily: 'IBM Plex Mono, ui-monospace, monospace',
            fontWeight: 500,
            fontSize: 14,
            letterSpacing: '0.04em',
            color: fieldGuideColors.orangeDeep,
          }}
        >
          {subtitle}
        </span>
      )}
    </Tag>
  );
}
