// ─── Poster PDF primitives ───────────────────────────────────────────────────
//
// IMPORTANT — Archivo Black substitute.
// Archivo Black crashes @react-pdf's CFF glyph parser (see
// apps/myk9show/src/features/premium/pdf/pdfFonts.ts comment block). For
// the entry-blank PDF we substitute **Inter Tight 800 / 900** wherever
// the web surfaces use Archivo Black. The visual register stays close
// because Inter Tight 900 is also a heavy condensed sans; the print
// reader will not perceive the change unless they have both PDFs side
// by side at 72pt.
//
// Web surfaces (landing page, wizard, email) use Archivo Black freely.
// Only this PDF substitutes.

import { Text, View } from '@react-pdf/renderer';

export const INK = '#1f1d18';
export const INK_SOFT = '#3a342a';
export const MUTE = '#7a7466';
export const HAIR = '#cabe9f';
export const PAPER = '#f3ede0';
export const PAPER_WARM = '#e9dfc8';
export const RED = '#c83b1a';
export const OLIVE = '#3d3a2a';

/** Display family — Inter Tight 800/900 (substitute for Archivo Black). */
export const DISPLAY = 'Inter Tight';
/** Body family — Inter at 400/500/600. */
export const BODY = 'Inter';
/** Mono family — IBM Plex Mono at 500/600. */
export const MONO = 'IBM Plex Mono';

/** Section header — "01." Inter Tight 900 + mono kicker title, mirroring
 *  the design mock's giant red folio number paired with mono section title. */
export function SectionHeader({
  number,
  title,
  kicker,
}: {
  number: string;
  title: string;
  /** Optional mono kicker after the title, e.g. "all fields required". */
  kicker?: string;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'baseline',
        borderBottomWidth: 1.5,
        borderBottomColor: INK,
        paddingBottom: 4,
        marginTop: 12,
        marginBottom: 8,
      }}
    >
      <Text
        style={{
          fontFamily: DISPLAY,
          fontWeight: 900,
          fontSize: 16,
          letterSpacing: -0.5,
          color: RED,
          marginRight: 12,
          lineHeight: 1,
        }}
      >
        {number}.
      </Text>
      <Text
        style={{
          fontFamily: MONO,
          fontWeight: 600,
          fontSize: 9,
          letterSpacing: 1.4,
          color: INK,
        }}
      >
        {title.toUpperCase()}
      </Text>
      {kicker && (
        <Text
          style={{
            fontFamily: MONO,
            fontSize: 8,
            color: MUTE,
            marginLeft: 12,
            letterSpacing: 1,
          }}
        >
          · {kicker}
        </Text>
      )}
    </View>
  );
}

/** Form field — mono caps label above a thin ink line. */
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
      ? { borderBottomWidth: 0.5, borderBottomColor: RED, borderStyle: 'dashed' as const }
      : { borderBottomWidth: 0.5, borderBottomColor: INK };

  return (
    <View style={{ width, paddingRight: 6, marginBottom: 7 }}>
      <Text
        style={{
          fontFamily: MONO,
          fontWeight: 500,
          fontSize: 7,
          letterSpacing: 1.4,
          color: MUTE,
          marginBottom: 1,
        }}
      >
        {label.toUpperCase()}
      </Text>
      <View style={{ ...lineStyle, minHeight: 15, justifyContent: 'flex-end' }}>
        {value ? <Text style={{ fontFamily: BODY, fontSize: 9, color: INK }}>{value}</Text> : null}
      </View>
      {hint ? (
        <Text style={{ fontFamily: MONO, fontSize: 7, color: MUTE, letterSpacing: 0.8 }}>
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
        <Text
          style={{
            fontFamily: DISPLAY,
            fontWeight: 800,
            fontSize: 9,
            color: RED,
            lineHeight: 1,
          }}
        >
          {'✕'}
        </Text>
      ) : null}
    </View>
  );
}
