import { Text, View } from '@react-pdf/renderer';
import {
  BODY,
  BRONZE,
  DISPLAY,
  INK,
  PAPER_DEEP,
  QUILL,
  SectionHeader,
} from './pdfPrimitives';

export function AgreementSection({ agreementText }: { agreementText: string }) {
  // Show only the first paragraph — the condensed version used on physical entry blanks.
  // The full multi-paragraph legal text lives in the premium list; the entry
  // blank references it by saying "Agreement printed in full on the premium list."
  const firstParagraph = agreementText.split('\n\n')[0] ?? agreementText;

  return (
    <View>
      <SectionHeader numeral="v" title="Agreement & signature" />

      <View
        style={{
          padding: 8,
          backgroundColor: PAPER_DEEP,
          borderLeftWidth: 1.5,
          borderRightWidth: 1.5,
          borderColor: BRONZE,
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

      <View style={{ flexDirection: 'row', gap: 24 }}>
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
