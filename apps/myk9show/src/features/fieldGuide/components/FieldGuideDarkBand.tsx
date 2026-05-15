import { type CSSProperties, type JSX, type ReactNode } from 'react';
import { FIELD_GUIDE_MONO_FAMILY } from '../fonts';
import { fieldGuideColors } from '../tokens';

export interface FieldGuideDarkBandProps {
  children: ReactNode;
  /** Vertical padding override in px. Default 10 (used for the top ID
   *  strip). Pass a larger value (e.g. 64) for the final CTA band or
   *  footer strip. */
  paddingY?: number;
  /** Horizontal padding override in px. Default 24. */
  paddingX?: number;
  /** Optional className for layout-level overrides at the call site. */
  className?: string;
  /** Render as a different element. Default `<div>`. Pass `'section'` or
   *  `'footer'` when the band is the page closer. */
  as?: 'div' | 'section' | 'footer';
  style?: CSSProperties;
}

/**
 * FieldGuideDarkBand — the inverted parchment-on-ink strip used three
 * places: top ID bar, mail-to panel, and the final CTA / footer. Provides
 * the dark surface; callers pass whatever content layout they need.
 *
 * Default font is mono — most usages of this band carry mono labels and
 * IDs. Callers writing a display-typeface block inside should set the
 * inner `fontFamily` themselves.
 */
export function FieldGuideDarkBand({
  children,
  paddingY = 10,
  paddingX = 24,
  className,
  as = 'div',
  style,
}: FieldGuideDarkBandProps): JSX.Element {
  const Tag = as;
  return (
    <Tag
      className={`fg-dark-band ${className ?? ''}`.trim()}
      style={{
        background: fieldGuideColors.paperDeep,
        color: fieldGuideColors.paper,
        padding: `${paddingY}px ${paddingX}px`,
        fontFamily: FIELD_GUIDE_MONO_FAMILY,
        fontWeight: 500,
        fontSize: 11,
        letterSpacing: '0.04em',
        ...style,
      }}
    >
      {children}
    </Tag>
  );
}
