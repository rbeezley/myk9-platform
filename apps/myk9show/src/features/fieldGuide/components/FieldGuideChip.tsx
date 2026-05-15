import { type CSSProperties, type JSX, type ReactNode } from 'react';
import { FIELD_GUIDE_MONO_FAMILY } from '../fonts';
import { fieldGuideColors } from '../tokens';

export type FieldGuideChipVariant = 'default' | 'orange' | 'cyan';

export interface FieldGuideChipProps {
  /** Color variant. Default = neutral parchment-ink chip. Orange = primary
   *  status indicator. Cyan = secondary "additional info" indicator,
   *  reserved for at-most 2–3× per page (HD master, 24-hr vet, etc). */
  variant?: FieldGuideChipVariant;
  /** Optional leading icon (lucide-react element, glyph string, etc). */
  icon?: ReactNode;
  /** Chip label. Expect short, uppercase strings like "OPEN", "TRIAL 01·03·05". */
  children: ReactNode;
  /** Style overrides for the rare layout-tweak need. */
  style?: CSSProperties;
}

/**
 * FieldGuideChip — the signature primitive of the Field Guide visual
 * register. Used in 10+ places: hero status row, particulars table cells,
 * judge cards, reference cards, schedule rows, wizard receipt header,
 * email confirmation header.
 *
 * Renders as an inline-flex span so chips sit on a baseline next to flowing
 * text without forcing line breaks. The mono family + tight letter-spacing
 * (`0.04em`, never the wider `0.32em` other styles use) is load-bearing —
 * it's how Field Guide signals "data label" rather than "design ornament."
 *
 * Accessibility: chips are decorative wrappers but their text content is
 * meaningful. Screen readers read them as part of the surrounding text.
 * Keep children short and human-readable ("OPEN", not "•").
 */
export function FieldGuideChip({
  variant = 'default',
  icon,
  children,
  style,
}: FieldGuideChipProps): JSX.Element {
  const palette =
    variant === 'orange'
      ? {
          background: fieldGuideColors.orange,
          color: fieldGuideColors.paper,
          borderColor: fieldGuideColors.orange,
        }
      : variant === 'cyan'
        ? {
            background: fieldGuideColors.cyan,
            color: fieldGuideColors.paper,
            borderColor: fieldGuideColors.cyan,
          }
        : {
            background: fieldGuideColors.paperWarm,
            color: fieldGuideColors.ink,
            borderColor: fieldGuideColors.ink,
          };

  return (
    <span
      className={`fg-chip fg-chip--${variant}`}
      data-variant={variant}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 6px',
        fontFamily: FIELD_GUIDE_MONO_FAMILY,
        fontWeight: 500,
        fontSize: 10.5,
        letterSpacing: '0.04em',
        background: palette.background,
        color: palette.color,
        border: `1px solid ${palette.borderColor}`,
        ...style,
      }}
    >
      {icon != null && (
        <span aria-hidden style={{ display: 'inline-flex', alignItems: 'center' }}>
          {icon}
        </span>
      )}
      {children}
    </span>
  );
}
