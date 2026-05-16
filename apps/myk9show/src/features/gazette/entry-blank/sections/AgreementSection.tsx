import { Text, View } from '@react-pdf/renderer';
import { BODY, DISPLAY, INK, QUILL, SectionHead } from './pdfPrimitives';

/**
 * Section v. Agreement & signature — single-paragraph condensed agreement
 * in a bordered box, followed by a signature + date row.
 *
 * Note: @react-pdf doesn't support CSS columns, so the design's
 * `column-count: 2` agreement layout collapses to a single justified
 * paragraph. The smaller 7.5pt body keeps the block from overflowing.
 */
export function AgreementSection({ agreementText }: { agreementText: string }) {
  const firstParagraph = agreementText.split('\n\n')[0] ?? agreementText;

  return (
    <View>
      <SectionHead folio="v." title="Agreement & signature" kicker="read before signing" />

      <View
        style={{
          borderWidth: 0.5,
          borderColor: INK,
          padding: 8,
          marginBottom: 8,
        }}
      >
        <Text
          style={{
            fontFamily: BODY,
            fontSize: 7.5,
            lineHeight: 1.55,
            color: INK,
            textAlign: 'justify',
          }}
        >
          {firstParagraph}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 18 }}>
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
            Signature of owner or agent
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
