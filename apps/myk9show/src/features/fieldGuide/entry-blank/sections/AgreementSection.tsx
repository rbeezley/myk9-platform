import { Text, View } from '@react-pdf/renderer';
import { BODY, INK, MUTE, SectionHeader, SERIF } from './pdfPrimitives';

/**
 * §05 Agreement & signature. INTENT: this is the *only* serif on the
 * Field Guide PDF — IBM Plex Serif at 7.5pt. The serif marks "long-form
 * legal language" against the otherwise mono-and-sans surface. Do not
 * switch to sans without explicit approval; see docs/INTENT.md.
 *
 * `fontWeight: 'normal'` is intentional — IBM Plex Serif is registered
 * at weight 500 (the closest available) and we let @react-pdf pick that
 * weight for paragraph copy. We do NOT use `fontStyle: 'italic'` here or
 * anywhere else on the Field Guide surface.
 */
export function AgreementSection({ agreementText }: { agreementText: string }) {
  const firstParagraph = agreementText.split('\n\n')[0] ?? agreementText;

  return (
    <View>
      <SectionHeader folio="§05" title="Agreement & signature" meta="READ BEFORE SIGNING" />

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
            fontFamily: SERIF,
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
              fontFamily: BODY,
              fontWeight: 500,
              fontSize: 7,
              letterSpacing: 0.4,
              color: MUTE,
              marginTop: 3,
              textTransform: 'uppercase',
            }}
          >
            Signature of owner or duly authorised agent
          </Text>
        </View>

        <View style={{ flex: 1 }}>
          <View style={{ borderBottomWidth: 0.5, borderBottomColor: INK, minHeight: 22 }} />
          <Text
            style={{
              fontFamily: BODY,
              fontWeight: 500,
              fontSize: 7,
              letterSpacing: 0.4,
              color: MUTE,
              marginTop: 3,
              textTransform: 'uppercase',
            }}
          >
            Date
          </Text>
        </View>
      </View>
    </View>
  );
}
