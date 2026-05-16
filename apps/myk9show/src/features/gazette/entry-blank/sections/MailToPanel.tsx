import { Text, View } from '@react-pdf/renderer';
import type { EntryBlankMailTo } from '../types';
import { BODY, BROWN, DISPLAY, INK, META, PAPER_WARM, QUILL } from './pdfPrimitives';

function PanelColumn({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <View style={{ flex: 1 }}>
      <Text
        style={{
          fontFamily: META,
          fontWeight: 500,
          fontSize: 6.5,
          letterSpacing: 1.4,
          textTransform: 'uppercase',
          color: BROWN,
          marginBottom: 4,
        }}
      >
        {heading}
      </Text>
      {children}
    </View>
  );
}

/**
 * Mail-to panel — bordered with the warm-paper inset background, two
 * columns (post / email). The double-rule border is emulated with two
 * nested View borders since @react-pdf doesn't support CSS `border-style:
 * double`.
 */
export function MailToPanel({ mailTo }: { mailTo: EntryBlankMailTo }) {
  return (
    <View
      style={{
        marginTop: 10,
        borderWidth: 0.6,
        borderColor: INK,
        padding: 10,
        backgroundColor: PAPER_WARM,
        position: 'relative',
      }}
    >
      <View
        style={{
          position: 'absolute',
          top: 3,
          left: 3,
          right: 3,
          bottom: 3,
          borderWidth: 0.4,
          borderColor: INK,
        }}
      />

      <View style={{ flexDirection: 'row', gap: 18 }}>
        <PanelColumn heading="Mail entries to">
          {mailTo.secretaryName && (
            <Text
              style={{
                fontFamily: DISPLAY,
                fontWeight: 700,
                fontSize: 11,
                color: INK,
                marginBottom: 2,
              }}
            >
              {mailTo.secretaryName}
            </Text>
          )}
          {mailTo.poBox && (
            <Text style={{ fontFamily: BODY, fontSize: 8, color: QUILL }}>{mailTo.poBox}</Text>
          )}
          {mailTo.cityStateZip && (
            <Text style={{ fontFamily: BODY, fontSize: 8, color: QUILL }}>{mailTo.cityStateZip}</Text>
          )}
        </PanelColumn>

        <PanelColumn heading="Email PDF entries to">
          {mailTo.email && (
            <Text
              style={{
                fontFamily: DISPLAY,
                fontWeight: 700,
                fontSize: 11,
                color: INK,
              }}
            >
              {mailTo.email}
            </Text>
          )}
          {mailTo.emailSubject && (
            <Text style={{ fontFamily: BODY, fontSize: 8, color: QUILL, marginTop: 2 }}>
              Subject: {mailTo.emailSubject}
            </Text>
          )}
          <Text style={{ fontFamily: BODY, fontSize: 8, color: QUILL, marginTop: 2 }}>
            Include payment confirmation №
          </Text>
        </PanelColumn>
      </View>
    </View>
  );
}
