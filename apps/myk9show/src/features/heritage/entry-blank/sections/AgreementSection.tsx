import { Text, View } from '@react-pdf/renderer';
import { BODY, DISPLAY, GOLD, INK, QUILL, SectionHeader } from './pdfPrimitives';

export function AgreementSection({ agreementText }: { agreementText: string }) {
  // Show only the first paragraph — the condensed version used on physical entry blanks.
  // The full three-paragraph legal text lives in the premium list; the entry blank
  // references it by saying "Agreement printed in full on the premium list."
  const firstParagraph = agreementText.split('\n\n')[0] ?? agreementText;

  return (
    <View>
      <SectionHeader numeral="§ V" title="Agreement & Signature" />

      <View
        style={{
          padding: 8,
          backgroundColor: '#f0e8d4',
          borderLeftWidth: 1.5,
          borderRightWidth: 1.5,
          borderColor: GOLD,
          marginBottom: 8,
        }}
      >
        <Text
          style={{
            fontFamily: BODY,
            fontSize: 7.5,
            lineHeight: 1.5,
            color: INK,
            textAlign: 'justify',
          }}
        >
          {firstParagraph}
        </Text>
      </View>

      {/* Signature row */}
      <View style={{ flexDirection: 'row', gap: 24 }}>
        {/* Signature line — 2/3 width */}
        <View style={{ flex: 2 }}>
          <View style={{ borderBottomWidth: 0.5, borderBottomColor: INK, minHeight: 22 }} />
          <Text
            style={{
              fontFamily: DISPLAY,
              fontStyle: 'italic',
              fontSize: 8,
              color: QUILL,
              marginTop: 3,
              textAlign: 'center',
            }}
          >
            Signature of owner or duly authorised agent
          </Text>
        </View>

        {/* Date line — 1/3 width */}
        <View style={{ flex: 1 }}>
          <View style={{ borderBottomWidth: 0.5, borderBottomColor: INK, minHeight: 22 }} />
          <Text
            style={{
              fontFamily: DISPLAY,
              fontStyle: 'italic',
              fontSize: 8,
              color: QUILL,
              marginTop: 3,
              textAlign: 'center',
            }}
          >
            Date
          </Text>
        </View>
      </View>
    </View>
  );
}
