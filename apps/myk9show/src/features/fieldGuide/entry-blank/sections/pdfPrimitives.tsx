import { Text, View } from '@react-pdf/renderer';

/**
 * Field Guide PDF primitives. Mirrors the Heritage / Banner pattern but
 * uses the parchment + indicator-orange palette and IBM Plex Sans + Mono
 * type stack. The orange is fixed (no per-club configurability) so we
 * import the constant from the colors block here rather than passing it
 * down as a prop on every section.
 *
 * IBM Plex Mono is aliased to JetBrains Mono in pdfFonts.ts (per the
 * v4/v5 glyph-table bug); we still pass the family name 'IBM Plex Mono'
 * here and the alias resolves transparently.
 */

export const INK = '#1f2a24';
export const SOFT = '#3a4339';
export const MUTE = '#6b6e5e';
export const HAIR = '#c4bba0';
export const PAPER = '#f6f1e6';
export const PAPER_WARM = '#ebe4cf';
export const PAPER_DEEP = '#1f2a24';
export const ORANGE = '#c96442';
export const ORANGE_DEEP = '#8a3e21';
export const CYAN = '#3a6e72';

export const DISPLAY = 'IBM Plex Sans';
export const BODY = 'IBM Plex Sans';
export const MONO = 'IBM Plex Mono';
export const SERIF = 'IBM Plex Serif';

/**
 * §-numbered section header. Three-column row: folio | title | meta.
 * Folio is mono-orange, title is sans-700, meta is mono-mute. A 2px ink
 * rule sits beneath the row.
 */
export function SectionHeader({
  folio,
  title,
  meta,
}: {
  folio: string;
  title: string;
  meta?: string;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        borderBottomWidth: 1.5,
        borderBottomColor: INK,
        paddingBottom: 3,
        marginBottom: 7,
        marginTop: 12,
      }}
    >
      <Text
        style={{
          fontFamily: MONO,
          fontWeight: 700,
          fontSize: 10,
          letterSpacing: 0.5,
          color: ORANGE_DEEP,
        }}
      >
        {folio}
      </Text>
      <Text
        style={{
          flex: 1,
          marginHorizontal: 12,
          fontFamily: DISPLAY,
          fontWeight: 700,
          fontSize: 11,
          letterSpacing: -0.2,
          color: INK,
        }}
      >
        {title}
      </Text>
      {meta && (
        <Text
          style={{
            fontFamily: MONO,
            fontWeight: 500,
            fontSize: 7,
            letterSpacing: 0.5,
            color: MUTE,
            textTransform: 'uppercase',
          }}
        >
          {meta}
        </Text>
      )}
    </View>
  );
}

/**
 * Single labelled form field — mono-caps label above a thin ink line.
 * The line is the load-bearing visual; if a value is supplied (pre-fill
 * mode), it sits inside the box.
 */
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
          fontFamily: MONO,
          fontWeight: 500,
          fontSize: 7,
          letterSpacing: 0.4,
          color: MUTE,
          textTransform: 'uppercase',
          marginBottom: 1,
        }}
      >
        {label}
      </Text>
      <View
        style={{
          borderBottomWidth: 0.5,
          borderBottomColor: INK,
          minHeight: 15,
          justifyContent: 'flex-end',
        }}
      >
        {value ? <Text style={{ fontFamily: BODY, fontSize: 9, color: INK }}>{value}</Text> : null}
      </View>
      {hint ? (
        <Text style={{ fontFamily: MONO, fontSize: 6.5, color: MUTE, marginTop: 1 }}>
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
        <Text style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 9, color: ORANGE, lineHeight: 1 }}>
          {'✕'}
        </Text>
      ) : null}
    </View>
  );
}

/** Tiny inline chip for the PDF surface — used in the masthead status row.
 *  PDF chips are simpler than the web variant: no icon slot, just a
 *  filled rectangle with mono caps text. */
export function PdfChip({
  children,
  variant = 'default',
}: {
  children: string;
  variant?: 'default' | 'orange';
}) {
  const isOrange = variant === 'orange';
  return (
    <View
      style={{
        backgroundColor: isOrange ? ORANGE : PAPER_WARM,
        borderWidth: 0.5,
        borderColor: isOrange ? ORANGE : INK,
        paddingHorizontal: 4,
        paddingVertical: 1,
        marginRight: 4,
      }}
    >
      <Text
        style={{
          fontFamily: MONO,
          fontWeight: 500,
          fontSize: 7,
          letterSpacing: 0.4,
          color: isOrange ? PAPER : INK,
        }}
      >
        {children}
      </Text>
    </View>
  );
}
