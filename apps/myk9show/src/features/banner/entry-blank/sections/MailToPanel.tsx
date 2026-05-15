import { Text, View } from '@react-pdf/renderer';
import type { EntryBlankMailTo } from '@/features/heritage/entry-blank/types';
import { BODY, DISPLAY, INK, MUTE } from './pdfPrimitives';

function PanelColumn({ heading, children, flag }: { heading: string; children: React.ReactNode; flag: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text
        style={{
          fontFamily: DISPLAY,
          fontWeight: 800,
          fontSize: 9,
          letterSpacing: 1.4,
          color: flag,
          marginBottom: 3,
        }}
      >
        {heading.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

export function MailToPanel({ mailTo, flag }: { mailTo: EntryBlankMailTo; flag: string }) {
  return (
    <View
      style={{
        marginTop: 10,
        borderTopWidth: 2,
        borderBottomWidth: 2,
        borderColor: flag,
        padding: 10,
      }}
    >
      <View style={{ flexDirection: 'row', gap: 20 }}>
        <PanelColumn heading="Return this blank, with payment, to:" flag={flag}>
          {mailTo.secretaryName && (
            <Text style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 11, color: INK, marginBottom: 2 }}>
              {mailTo.secretaryName}
            </Text>
          )}
          {mailTo.poBox && (
            <Text style={{ fontFamily: BODY, fontSize: 9, color: INK }}>{mailTo.poBox}</Text>
          )}
          {mailTo.cityStateZip && (
            <Text style={{ fontFamily: BODY, fontSize: 9, color: INK }}>{mailTo.cityStateZip}</Text>
          )}
        </PanelColumn>

        <PanelColumn heading="Or scan and email to:" flag={flag}>
          {mailTo.email && (
            <Text style={{ fontFamily: BODY, fontSize: 9, color: INK }}>{mailTo.email}</Text>
          )}
          {mailTo.emailSubject && (
            <Text style={{ fontFamily: BODY, fontSize: 8.5, color: MUTE, marginTop: 2 }}>
              Subject: {mailTo.emailSubject}
            </Text>
          )}
          <Text style={{ fontFamily: BODY, fontSize: 8.5, color: MUTE, marginTop: 1 }}>
            Include payment confirmation.
          </Text>
        </PanelColumn>
      </View>
    </View>
  );
}
