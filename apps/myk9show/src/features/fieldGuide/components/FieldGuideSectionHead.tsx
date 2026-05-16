import { type JSX, type ReactNode } from 'react';
import { FIELD_GUIDE_DISPLAY_FAMILY, FIELD_GUIDE_MONO_FAMILY } from '../fonts';
import { fieldGuideColors } from '../tokens';

export interface FieldGuideSectionHeadProps {
  /** Section folio, e.g. "§01" or "§02". The § character is part of the
   *  visual register — pass it in (don't strip it). */
  folio: string;
  /** Section title, e.g. "Welcome & purpose". */
  title: ReactNode;
  /** Right-aligned meta caption — e.g. "REFERENCE DATA" or
   *  "LIVE · UPDATED 28 MAY 09:42 CT". Optional. */
  meta?: ReactNode;
}

/**
 * FieldGuideSectionHead — the §-numbered three-column header that opens
 * every Field Guide content section. Layout: `[folio] [title] [meta]`
 * with a 2px ink rule beneath. The folio is mono-orange, the title is
 * IBM Plex Sans 700, the meta is mono-mute.
 *
 * Mobile collapse (under 960px) flattens the three columns into a single
 * stacked column via `fieldGuide.css`. Don't hardcode that breakpoint at
 * the call site.
 */
export function FieldGuideSectionHead({
  folio,
  title,
  meta,
}: FieldGuideSectionHeadProps): JSX.Element {
  return (
    <header
      className="fg-section-head"
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        gap: 24,
        alignItems: 'baseline',
        paddingBottom: 12,
        borderBottom: `2px solid ${fieldGuideColors.ink}`,
        marginBottom: 32,
      }}
    >
      <div
        style={{
          fontFamily: FIELD_GUIDE_MONO_FAMILY,
          fontWeight: 600,
          fontSize: 14,
          letterSpacing: '0.04em',
          color: fieldGuideColors.orangeDeep,
        }}
      >
        {folio}
      </div>
      <h2
        style={{
          margin: 0,
          fontFamily: FIELD_GUIDE_DISPLAY_FAMILY,
          fontWeight: 700,
          fontSize: 28,
          letterSpacing: '-0.02em',
          lineHeight: 1.1,
          color: fieldGuideColors.ink,
        }}
      >
        {title}
      </h2>
      {meta != null && (
        <div
          style={{
            fontFamily: FIELD_GUIDE_MONO_FAMILY,
            fontWeight: 500,
            fontSize: 11,
            letterSpacing: '0.04em',
            color: fieldGuideColors.mute,
          }}
        >
          {meta}
        </div>
      )}
    </header>
  );
}
