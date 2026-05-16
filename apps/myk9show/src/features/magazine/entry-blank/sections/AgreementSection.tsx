import { Text, View } from '@react-pdf/renderer';
import { BODY, DISPLAY, GOLD_2, INK, MagazineSectionHeader, MUTE, SOFT } from './pdfPrimitives';

/**
 * §V Agreement and Signature.
 *
 * Renders the condensed first paragraph of the registry's exhibitor
 * agreement (full three-paragraph text lives in the premium list) inside a
 * 2-column justified block — matching the design handoff's `.agreement`
 * block. Below the agreement: two stacked signature/date fields with the
 * line below each label.
 *
 * `@react-pdf/renderer` does not support `column-count`, so the 2-column
 * effect is approximated by reducing font size and tightening leading; the
 * paragraph remains readable on a single page when rendered to PDF.
 */
export function AgreementSection({ agreementText }: { agreementText: string }) {
  const firstParagraph = agreementText.split('\n\n')[0] ?? agreementText;

  return (
    <View>
      <MagazineSectionHeader numeral="v" title="Agreement & signature" kicker="read before signing" />

      <View
        style={{
          borderWidth: 0.5,
          borderColor: INK,
          padding: 10,
          marginBottom: 8,
        }}
      >
        <Text
          style={{
            fontFamily: BODY,
            fontSize: 7.5,
            lineHeight: 1.55,
            color: SOFT,
            textAlign: 'justify',
          }}
        >
          {firstParagraph}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 24, marginTop: 8 }}>
        {/* Signature line — 2/3 width */}
        <View style={{ flex: 2 }}>
          <View
            style={{ borderBottomWidth: 0.5, borderBottomColor: INK, minHeight: 24 }}
          />
          <Text
            style={{
              fontFamily: DISPLAY,
              fontStyle: 'italic',
              fontSize: 8,
              color: MUTE,
              marginTop: 4,
              textAlign: 'center',
            }}
          >
            Signature of owner or duly authorised agent
          </Text>
        </View>

        {/* Date line — 1/3 width */}
        <View style={{ flex: 1 }}>
          <View
            style={{ borderBottomWidth: 0.5, borderBottomColor: INK, minHeight: 24 }}
          />
          <Text
            style={{
              fontFamily: DISPLAY,
              fontStyle: 'italic',
              fontSize: 8,
              color: MUTE,
              marginTop: 4,
              textAlign: 'center',
            }}
          >
            Date
          </Text>
        </View>
      </View>

      {/* Dotted-gold tail rule — the handoff uses a hairline to mark the
       *  agreement block's end. Re-using the dashed-gold pattern keeps the
       *  visual rhythm with the other section borders. */}
      <View
        style={{
          marginTop: 10,
          borderTopWidth: 0.5,
          borderTopColor: GOLD_2,
          borderStyle: 'dashed',
        }}
      />
    </View>
  );
}
