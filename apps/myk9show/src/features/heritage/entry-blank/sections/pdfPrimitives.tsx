import { Text, View } from '@react-pdf/renderer';
import { STYLE_TOKENS } from '../../../premium/pdf/pdfStyles';

const T = STYLE_TOKENS.heritage;

export const INK = T.accentColor; // #29200f
export const GOLD = T.secondaryColor; // #b08948
export const CLARET = T.accentDeep!; // #7a1f1f
export const PAPER = T.surfaceColor; // #f4ecd8
export const QUILL = '#6b4f3a';
export const DISPLAY = T.displayFont; // Cormorant Garamond
export const BODY = T.bodyFont; // EB Garamond

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
      <View style={{ flex: 1, borderTopWidth: 0.5, borderTopColor: color }} />
      <Text
        style={{
          fontFamily: DISPLAY,
          fontSize: 11,
          color: color,
          marginHorizontal: 6,
          lineHeight: 1,
        }}
      >
        {'✦'}
      </Text>
      <View style={{ flex: 1, borderTopWidth: 0.5, borderTopColor: color }} />
    </View>
  );
}

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
          fontFamily: DISPLAY,
          fontStyle: 'italic',
          fontSize: 11,
          color: CLARET,
          marginRight: 8,
          minWidth: 22,
        }}
      >
        {numeral}
      </Text>
      <Text
        style={{
          fontFamily: BODY,
          fontSize: 8,
          letterSpacing: 1.8,
          textTransform: 'uppercase',
          color: INK,
        }}
      >
        {title}
      </Text>
    </View>
  );
}

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
      ? { borderBottomWidth: 0.5, borderBottomColor: GOLD, borderStyle: 'dashed' as const }
      : { borderBottomWidth: 0.5, borderBottomColor: INK };

  return (
    <View style={{ width, paddingRight: 6, marginBottom: 7 }}>
      <Text style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 8, color: QUILL }}>
        {label}
      </Text>
      <View style={{ ...lineStyle, minHeight: 15, justifyContent: 'flex-end' }}>
        {value ? <Text style={{ fontFamily: BODY, fontSize: 9, color: INK }}>{value}</Text> : null}
      </View>
      {hint ? (
        <Text style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 7.5, color: QUILL }}>
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
        <Text style={{ fontFamily: DISPLAY, fontSize: 9, color: CLARET, lineHeight: 1 }}>
          {'✕'}
        </Text>
      ) : null}
    </View>
  );
}
