import { Text, View } from '@react-pdf/renderer';
import type { EntryBlankMailTo } from '@/features/heritage/entry-blank/types';
import { BODY, DISPLAY, MONO, ORANGE, PAPER, PAPER_DEEP } from './pdfPrimitives';

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
          fontWeight: 500,
          fontSize: 7,
          letterSpacing: 0.5,
          color: ORANGE,
          textTransform: 'uppercase',
          marginBottom: 4,
        }}
      >
        {heading}
      </Text>
      {children}
    </View>
  );
}

export function MailToPanel({ mailTo }: { mailTo: EntryBlankMailTo }) {
  return (
    <View
      style={{
        marginTop: 10,
        backgroundColor: PAPER_DEEP,
        padding: 10,
        flexDirection: 'row',
        gap: 18,
      }}
    >
      <PanelColumn heading="Mail entries to">
        {mailTo.secretaryName && (
          <Text
            style={{
              fontFamily: DISPLAY,
              fontWeight: 700,
              fontSize: 11,
              color: PAPER,
              marginBottom: 2,
            }}
          >
            {mailTo.secretaryName}
          </Text>
        )}
        {mailTo.poBox && (
          <Text style={{ fontFamily: BODY, fontSize: 8.5, color: PAPER, opacity: 0.8 }}>
            {mailTo.poBox}
          </Text>
        )}
        {mailTo.cityStateZip && (
          <Text style={{ fontFamily: BODY, fontSize: 8.5, color: PAPER, opacity: 0.8 }}>
            {mailTo.cityStateZip}
          </Text>
        )}
      </PanelColumn>

      <PanelColumn heading="Email PDF entries to">
        {mailTo.email && (
          <Text style={{ fontFamily: BODY, fontSize: 8.5, color: PAPER }}>{mailTo.email}</Text>
        )}
        {mailTo.emailSubject && (
          <Text style={{ fontFamily: BODY, fontSize: 8, color: PAPER, opacity: 0.7, marginTop: 2 }}>
            Subject: {mailTo.emailSubject}
          </Text>
        )}
        <Text style={{ fontFamily: BODY, fontSize: 8, color: PAPER, opacity: 0.7, marginTop: 1 }}>
          Include payment confirmation #
        </Text>
      </PanelColumn>
    </View>
  );
}
