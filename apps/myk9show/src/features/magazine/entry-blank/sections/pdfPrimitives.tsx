import { Text, View } from '@react-pdf/renderer';

// ─── Magazine PDF palette ─────────────────────────────────────────────────────
//
// Local copy of the Magazine colors used inside the PDF renderer. The
// `@react-pdf/renderer` runtime cannot read CSS custom properties or import
// from `tokens.ts` at parse time without bundling weirdness, so we duplicate
// the small subset of tokens the PDF actually needs. Source of truth is
// `apps/myk9show/src/features/magazine/tokens.ts` — keep these in sync.

export const PAPER = '#f6f1e8';
export const PAPER_DEEP = '#ece4d3';
export const INK = '#1a1a1a';
export const SOFT = '#2e2820';
export const MUTE = '#7a6e58';
export const QUILL = '#5c4f3a';
export const GOLD_1 = '#c9a87c';
export const GOLD_2 = '#a8814f';
export const GOLD_3 = '#4a3826';

// Font families registered in features/premium/pdf/pdfFonts.ts.
export const DISPLAY = 'Cormorant Garamond';
export const BODY = 'Source Serif 4';
export const META = 'Inter Tight';

// ─── Primitives ───────────────────────────────────────────────────────────────

/**
 * Gold-gradient hairline.
 *
 * `@react-pdf/renderer` does not support CSS gradients on background, so the
 * "gradient" here is a single solid bar in `GOLD_2`. The handoff renders a
 * true gold gradient on web; in print, the printed page reads close enough
 * to the same warm tone that the missing transition is invisible.
 */
export function GoldRule({ thick = false }: { thick?: boolean }) {
  return (
    <View
      style={{
        height: thick ? 2 : 1,
        backgroundColor: GOLD_2,
        marginVertical: thick ? 4 : 2,
      }}
    />
  );
}

/**
 * Section header — italic lowercase Roman folio (i / ii / iii / …) on the
 * left, tracked smallcaps title on the right, with a thin ink rule along
 * the bottom.
 *
 * The kicker text (italic Cormorant) is rendered to the right of the title
 * when present, mirroring the design handoff's `.sec-title .kicker` block.
 */
export function MagazineSectionHeader({
  numeral,
  title,
  kicker,
}: {
  numeral: string;
  title: string;
  kicker?: string;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'baseline',
        borderBottomWidth: 0.5,
        borderBottomColor: INK,
        paddingBottom: 4,
        marginBottom: 8,
        marginTop: 10,
      }}
    >
      <Text
        style={{
          fontFamily: DISPLAY,
          fontStyle: 'italic',
          fontWeight: 500,
          fontSize: 16,
          color: GOLD_3,
          marginRight: 12,
          minWidth: 20,
        }}
      >
        {numeral}
      </Text>
      <Text
        style={{
          fontFamily: META,
          fontWeight: 500,
          fontSize: 8,
          letterSpacing: 2,
          textTransform: 'uppercase',
          color: INK,
        }}
      >
        {title}
      </Text>
      {kicker && (
        <Text
          style={{
            fontFamily: DISPLAY,
            fontStyle: 'italic',
            fontSize: 9.5,
            color: MUTE,
            marginLeft: 12,
            letterSpacing: 0.2,
          }}
        >
          {kicker}
        </Text>
      )}
    </View>
  );
}

/**
 * Label-over-line field. Used throughout the form for free-text entry.
 *
 * `variant` controls the underline style:
 *  - `solid` — for required first-line fields (Registered name, etc.)
 *  - `dotted` — for secondary fields (sire/dam, breeder) where the form
 *    asks for the info but does not require it
 */
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
      ? { borderBottomWidth: 0.5, borderBottomColor: GOLD_2, borderStyle: 'dashed' as const }
      : { borderBottomWidth: 0.5, borderBottomColor: INK };

  return (
    <View style={{ width, paddingRight: 6, marginBottom: 7 }}>
      <Text
        style={{
          fontFamily: META,
          fontWeight: 500,
          fontSize: 6.8,
          letterSpacing: 2,
          textTransform: 'uppercase',
          color: GOLD_3,
          marginBottom: 3,
        }}
      >
        {label}
      </Text>
      <View style={{ ...lineStyle, minHeight: 15, justifyContent: 'flex-end' }}>
        {value ? (
          <Text style={{ fontFamily: BODY, fontSize: 9, color: INK }}>{value}</Text>
        ) : null}
      </View>
      {hint ? (
        <Text style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 7.5, color: MUTE }}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export function Checkbox({ checked = false }: { checked?: boolean }) {
  return (
    <View
      style={{
        width: 9,
        height: 9,
        borderWidth: 0.5,
        borderColor: INK,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {checked ? (
        <Text style={{ fontFamily: DISPLAY, fontSize: 10, color: GOLD_3, lineHeight: 1 }}>
          {'✕'}
        </Text>
      ) : null}
    </View>
  );
}
