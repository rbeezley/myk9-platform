import { Text, View } from '@react-pdf/renderer';
import { BODY, INK, MUTE, PAPER_WARM, SectionHeader } from './pdfPrimitives';

export function AgreementSection({
  agreementText,
  flag,
}: {
  agreementText: string;
  flag: string;
}) {
  const firstParagraph = agreementText.split('\n\n')[0] ?? agreementText;

  return (
    <View>
      <SectionHeader number="05" title="Agreement & signature" flag={flag} />

      <View
        style={{
          padding: 8,
          backgroundColor: PAPER_WARM,
          borderLeftWidth: 2,
          borderColor: flag,
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
              fontFamily: BODY,
              fontWeight: 500,
              fontSize: 7,
              letterSpacing: 1.4,
              color: MUTE,
              marginTop: 3,
              textAlign: 'center',
            }}
          >
            SIGNATURE OF OWNER OR DULY AUTHORISED AGENT
          </Text>
        </View>

        <View style={{ flex: 1 }}>
          <View style={{ borderBottomWidth: 0.5, borderBottomColor: INK, minHeight: 22 }} />
          <Text
            style={{
              fontFamily: BODY,
              fontWeight: 500,
              fontSize: 7,
              letterSpacing: 1.4,
              color: MUTE,
              marginTop: 3,
              textAlign: 'center',
            }}
          >
            DATE
          </Text>
        </View>
      </View>

    </View>
  );
}
