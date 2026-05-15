import { Text, View } from '@react-pdf/renderer';

/**
 * Banner PDF primitives. Mirrors the Heritage / Monogram pattern but uses
 * the Banner palette and Inter Tight + Inter type stack. The flag color is
 * passed through as a prop (not a constant) because Banner is per-club
 * configurable — sections receive `flag` from the Document and forward it
 * down to SectionHeader, Field, and Checkbox where needed.
 */

export const INK = '#111111';
export const SOFT = '#2a2a2a';
export const MUTE = '#6b6b6b';
export const HAIR = '#d8d8d4';
export const PAPER = '#fafaf8';
export const PAPER_WARM = '#f0eeea';

export const DISPLAY = 'Inter Tight';
export const BODY = 'Inter';

/** Bracketing rule — 2pt brand-color horizontal line. Banner has no
 *  ornament glyphs, so this is just a hairline of presence. */
export function FlagRule({ color, height = 2 }: { color: string; height?: number }) {
  return (
    <View
      style={{
        height,
        backgroundColor: color,
        marginVertical: 4,
      }}
    />
  );
}

/** Section header — "01 / SECTION" left-aligned in Inter Tight on the
 *  brand color, plus a thin ink rule beneath. */
export function SectionHeader({
  number,
  title,
  flag,
}: {
  number: string;
  title: string;
  flag: string;
}) {
  return (
    <View
      style={{
        flexDirection: 'column',
        borderBottomWidth: 0.5,
        borderBottomColor: INK,
        paddingBottom: 3,
        marginBottom: 7,
        marginTop: 12,
      }}
    >
      <Text
        style={{
          fontFamily: DISPLAY,
          fontWeight: 800,
          fontSize: 10,
          letterSpacing: 1.8,
          color: flag,
        }}
      >
        {number} / {title.toUpperCase()}
      </Text>
    </View>
  );
}

/** Form field — Inter caps label above a thin ink line. The dotted
 *  variant uses brand-color dashed line for fields not sourced from DB. */
export function Field({
  label,
  value,
  hint,
  variant = 'solid',
  width = '100%',
  flag,
}: {
  label: string;
  value?: string | null;
  hint?: string;
  variant?: 'solid' | 'dotted';
  width?: string;
  flag: string;
}) {
  const lineStyle =
    variant === 'dotted'
      ? { borderBottomWidth: 0.5, borderBottomColor: flag, borderStyle: 'dashed' as const }
      : { borderBottomWidth: 0.5, borderBottomColor: INK };

  return (
    <View style={{ width, paddingRight: 6, marginBottom: 7 }}>
      <Text
        style={{
          fontFamily: BODY,
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
        <Text style={{ fontFamily: BODY, fontSize: 7.5, color: MUTE }}>{hint}</Text>
      ) : null}
    </View>
  );
}

export function Checkbox({ checked = false, flag }: { checked?: boolean; flag: string }) {
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
        <Text style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 9, color: flag, lineHeight: 1 }}>
          {'✕'}
        </Text>
      ) : null}
    </View>
  );
}
