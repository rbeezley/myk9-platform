import { Text, View } from '@react-pdf/renderer';

// ─── Monogram PDF tokens ──────────────────────────────────────────────────────
//
// Mirrors features/monogram/tokens.ts but reduced to the values the PDF needs.
// Keeps these tokens local to entry-blank rendering so the @react-pdf module
// boundary stays clean (no Web CSS imports). All hex values are byte-identical
// to monogramColors so the PDF and web surfaces match.

export const INK = '#1c1815';
export const SOFT = '#3a342c';
export const QUILL = '#5a4f3e';
export const MUTE = '#7a6f5e';
export const BRONZE = '#8a6938';
export const LEAF = '#c9a14b';
export const PAPER = '#f3eee4';
export const PAPER_DEEP = '#ece5d4';
export const HAIRLINE = 'rgba(28, 24, 21, 0.18)';

export const DISPLAY = 'Bodoni Moda';
export const BODY = 'Crimson Pro';
export const MONO = 'Italiana';

/** Diamond ornament rule. Monogram uses a filled diamond ◆ where Heritage
 *  uses an outlined six-point star. Lines are thinner (0.5pt) than Heritage's
 *  default. */
export function OrnamentRule({ color = INK }: { color?: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginVertical: 5,
        maxWidth: 240,
        alignSelf: 'center',
      }}
    >
      <View style={{ flex: 1, borderTopWidth: 0.4, borderTopColor: color }} />
      <Text
        style={{
          fontFamily: DISPLAY,
          fontSize: 10,
          color: color,
          marginHorizontal: 6,
          lineHeight: 1,
        }}
      >
        {'◆'}
      </Text>
      <View style={{ flex: 1, borderTopWidth: 0.4, borderTopColor: color }} />
    </View>
  );
}

/** Section header — lowercase-roman folio in Italiana bronze on the left,
 *  bronze small-caps title on the right, separated from the section body by
 *  a 1px ink rule. Matches the `.sec-head` block in the entry-blank mock. */
export function SectionHeader({ numeral, title }: { numeral: string; title: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'baseline',
        borderBottomWidth: 0.5,
        borderBottomColor: INK,
        paddingBottom: 3,
        marginBottom: 7,
        marginTop: 12,
      }}
    >
      <Text
        style={{
          fontFamily: MONO,
          fontSize: 18,
          color: BRONZE,
          marginRight: 10,
          minWidth: 22,
          letterSpacing: -0.5,
        }}
      >
        {numeral}
      </Text>
      <Text
        style={{
          fontFamily: BODY,
          fontSize: 8.5,
          fontWeight: 500,
          letterSpacing: 2.5,
          textTransform: 'uppercase',
          color: INK,
        }}
      >
        {title}
      </Text>
    </View>
  );
}

/** Form field — bronze small-caps label above a thin ink line. `dotted`
 *  variant uses a hair-color dashed line (for derivative fields like sire/dam
 *  that aren't currently sourced from the DB). */
export function Field({
  label,
  value,
  hint,
  variant = 'solid',
  width = '100%',
}: {
  label: string;
  value?: string | null;
  hint?: string;
  variant?: 'solid' | 'dotted';
  width?: string;
}) {
  const lineStyle =
    variant === 'dotted'
      ? { borderBottomWidth: 0.5, borderBottomColor: BRONZE, borderStyle: 'dashed' as const }
      : { borderBottomWidth: 0.5, borderBottomColor: INK };

  return (
    <View style={{ width, paddingRight: 6, marginBottom: 7 }}>
      <Text
        style={{
          fontFamily: BODY,
          fontSize: 7,
          fontWeight: 500,
          letterSpacing: 1.5,
          textTransform: 'uppercase',
          color: BRONZE,
          marginBottom: 1,
        }}
      >
        {label}
      </Text>
      <View style={{ ...lineStyle, minHeight: 15, justifyContent: 'flex-end' }}>
        {value ? <Text style={{ fontFamily: BODY, fontSize: 9, color: INK }}>{value}</Text> : null}
      </View>
      {hint ? (
        <Text
          style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 7.5, color: QUILL }}
        >
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** Checkbox — 8x8pt ink border with a bronze ✕ when checked. */
export function Checkbox({ checked = false }: { checked?: boolean }) {
  return (
    <View
      style={{
        width: 8,
        height: 8,
        borderWidth: 0.5,
        borderColor: INK,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {checked ? (
        <Text style={{ fontFamily: DISPLAY, fontSize: 9, color: BRONZE, lineHeight: 1 }}>
          {'✕'}
        </Text>
      ) : null}
    </View>
  );
}
