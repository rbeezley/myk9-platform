import { Text, View } from '@react-pdf/renderer';

/**
 * Gazette PDF primitives. Token names are the @react-pdf Font.register()
 * family strings — those families are already registered globally by
 * apps/myk9show/src/features/premium/pdf/pdfFonts.ts (entry-point of any
 * `react-pdf` document). We do not register again.
 *
 * Old-style figures — README §Visual System calls for `font-feature-settings:
 * "onum" 1` on body copy. @react-pdf does NOT implement OpenType feature
 * shaping (pdfkit reads glyph tables directly, no layout engine), so PDF
 * numerals stay lining. This is an accepted degradation; the printed entry
 * blank still reads as "newspaper" because the typography stack and rules
 * dominate the numerals.
 */

export const INK = '#2a2520';
export const PAPER = '#f7f1e3';
export const PAPER_WARM = '#ede5d2';
export const BROWN = '#6b4f3a';
export const QUILL = '#7a6e58';
export const HAIR = '#b8a98a';
export const SOFT = '#3d352c';

export const DISPLAY = 'Playfair Display';
export const BODY = 'Source Serif 4';
export const META = 'IBM Plex Mono';

/** 4px double horizontal rule. Emulated with two 0.5px stacked borders. */
export function DoubleRule({ color = INK, marginVertical = 6 }: { color?: string; marginVertical?: number }) {
  return (
    <View style={{ marginVertical }}>
      <View style={{ borderBottomWidth: 0.6, borderBottomColor: color }} />
      <View style={{ marginTop: 1.5, borderBottomWidth: 0.6, borderBottomColor: color }} />
    </View>
  );
}

/** Single-pixel hairline in hair tone. */
export function Hairline({ color = HAIR, marginVertical = 4 }: { color?: string; marginVertical?: number }) {
  return <View style={{ marginVertical, borderBottomWidth: 0.4, borderBottomColor: color }} />;
}

/** Lowercase-roman section folio + uppercase title row. */
export function SectionHead({
  folio,
  title,
  kicker,
}: {
  folio: string;
  title: string;
  kicker?: string;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'baseline',
        borderBottomWidth: 1.2,
        borderBottomColor: INK,
        paddingBottom: 3,
        marginBottom: 8,
        marginTop: 10,
      }}
    >
      <Text
        style={{
          fontFamily: DISPLAY,
          fontWeight: 900,
          fontSize: 16,
          color: BROWN,
          marginRight: 10,
          letterSpacing: -0.5,
        }}
      >
        {folio}
      </Text>
      <Text
        style={{
          fontFamily: META,
          fontWeight: 600,
          fontSize: 8,
          letterSpacing: 1.6,
          textTransform: 'uppercase',
          color: INK,
          flex: 1,
        }}
      >
        {title}
      </Text>
      {kicker && (
        <Text
          style={{
            fontFamily: DISPLAY,
            fontStyle: 'italic',
            fontSize: 9,
            color: QUILL,
            marginLeft: 8,
          }}
        >
          {kicker}
        </Text>
      )}
    </View>
  );
}

/** Labelled form field with under-line rule. */
export function Field({
  label,
  value,
  hint,
  width = '100%',
}: {
  label: string;
  value?: string | null;
  hint?: string;
  width?: string;
}) {
  return (
    <View style={{ width, paddingRight: 6, marginBottom: 7 }}>
      <Text
        style={{
          fontFamily: META,
          fontWeight: 500,
          fontSize: 6.5,
          letterSpacing: 1.4,
          textTransform: 'uppercase',
          color: BROWN,
          marginBottom: 1,
        }}
      >
        {label}
      </Text>
      <View
        style={{
          borderBottomWidth: 0.5,
          borderBottomColor: INK,
          minHeight: 14,
          justifyContent: 'flex-end',
        }}
      >
        {value && (
          <Text style={{ fontFamily: BODY, fontSize: 9, color: INK, paddingBottom: 1 }}>{value}</Text>
        )}
      </View>
      {hint && (
        <Text
          style={{
            fontFamily: DISPLAY,
            fontStyle: 'italic',
            fontSize: 7,
            color: QUILL,
            marginTop: 1,
          }}
        >
          {hint}
        </Text>
      )}
    </View>
  );
}

/** Box checkbox with optional ✕ mark. */
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
        <Text style={{ fontFamily: DISPLAY, fontSize: 9, color: INK, lineHeight: 1 }}>{'✕'}</Text>
      ) : null}
    </View>
  );
}
