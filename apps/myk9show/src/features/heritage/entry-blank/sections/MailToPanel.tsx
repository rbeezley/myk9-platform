import { Text, View } from '@react-pdf/renderer';
import type { EntryBlankMailTo } from '../types';
import { BODY, CLARET, DISPLAY, INK, QUILL } from './pdfPrimitives';

function PanelColumn({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <View style={{ flex: 1 }}>
      <Text
        style={{
          fontFamily: DISPLAY,
          fontStyle: 'italic',
          fontSize: 10,
          color: CLARET,
          marginBottom: 3,
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
        borderWidth: 0.5,
        borderColor: INK,
        padding: 10,
        position: 'relative',
      }}
    >
      {/* Inner double-border effect via nested View */}
      <View
        style={{
          position: 'absolute',
          top: 3,
          left: 3,
          right: 3,
          bottom: 3,
          borderWidth: 0.5,
          borderColor: INK,
        }}
      />

      <View style={{ flexDirection: 'row', gap: 20, position: 'relative' }}>
        <PanelColumn heading="Return this blank, with payment, to:">
          {mailTo.secretaryName && (
            <Text
              style={{
                fontFamily: DISPLAY,
                fontStyle: 'italic',
                fontWeight: 700,
                fontSize: 9,
                color: QUILL,
                marginBottom: 1,
              }}
            >
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

        <PanelColumn heading="Or scan and email to:">
          {mailTo.email && (
            <Text style={{ fontFamily: BODY, fontSize: 9, color: INK }}>{mailTo.email}</Text>
          )}
          {mailTo.emailSubject && (
            <Text
              style={{
                fontFamily: DISPLAY,
                fontStyle: 'italic',
                fontSize: 8.5,
                color: QUILL,
                marginTop: 2,
              }}
            >
              Subject: {mailTo.emailSubject}
            </Text>
          )}
          <Text
            style={{
              fontFamily: DISPLAY,
              fontStyle: 'italic',
              fontSize: 8.5,
              color: QUILL,
              marginTop: 1,
            }}
          >
            Include payment confirmation.
          </Text>
        </PanelColumn>
      </View>
    </View>
  );
}
