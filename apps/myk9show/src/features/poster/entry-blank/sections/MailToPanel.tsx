import { Text, View } from '@react-pdf/renderer';
import type { EntryBlankMailTo } from '@/features/heritage/entry-blank/types';
import { BODY, DISPLAY, INK, MONO, PAPER, RED } from './pdfPrimitives';

function PanelColumn({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text
        style={{
          fontFamily: MONO,
          fontWeight: 600,
          fontSize: 7,
          letterSpacing: 1.4,
          color: RED,
          marginBottom: 4,
        }}
      >
        {heading.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

/**
 * Mail-to panel — ink background block at the bottom of the page with two
 * columns (mail address + email). Mirrors the design mock's dark band
 * with cream text + Inter Tight 900 large display values.
 */
export function MailToPanel({ mailTo }: { mailTo: EntryBlankMailTo }) {
  return (
    <View
      style={{
        marginTop: 10,
        backgroundColor: INK,
        padding: 12,
      }}
    >
      <View style={{ flexDirection: 'row', gap: 18 }}>
        <PanelColumn heading="Mail entries to">
          {mailTo.secretaryName && (
            <Text
              style={{
                fontFamily: DISPLAY,
                fontWeight: 900,
                fontSize: 12,
                letterSpacing: -0.4,
                color: PAPER,
                marginBottom: 2,
              }}
            >
              {mailTo.secretaryName.toUpperCase()}
            </Text>
          )}
          {mailTo.poBox && (
            <Text
              style={{
                fontFamily: MONO,
                fontSize: 8.5,
                color: 'rgba(243,237,224,0.85)',
                lineHeight: 1.4,
              }}
            >
              {mailTo.poBox}
            </Text>
          )}
          {mailTo.cityStateZip && (
            <Text
              style={{
                fontFamily: MONO,
                fontSize: 8.5,
                color: 'rgba(243,237,224,0.85)',
                lineHeight: 1.4,
              }}
            >
              {mailTo.cityStateZip}
            </Text>
          )}
        </PanelColumn>

        <PanelColumn heading="Email PDF entries to">
          {mailTo.email && (
            <Text
              style={{
                fontFamily: DISPLAY,
                fontWeight: 800,
                fontSize: 11,
                letterSpacing: -0.3,
                color: PAPER,
              }}
            >
              {mailTo.email}
            </Text>
          )}
          {mailTo.emailSubject && (
            <Text
              style={{
                fontFamily: BODY,
                fontSize: 8,
                color: 'rgba(243,237,224,0.7)',
                marginTop: 3,
              }}
            >
              Subject: {mailTo.emailSubject}
            </Text>
          )}
          <Text
            style={{
              fontFamily: BODY,
              fontSize: 8,
              color: 'rgba(243,237,224,0.7)',
              marginTop: 1,
            }}
          >
            Include payment confirmation #
          </Text>
        </PanelColumn>
      </View>
    </View>
  );
}
