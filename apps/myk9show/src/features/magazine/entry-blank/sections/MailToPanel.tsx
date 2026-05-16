import { Text, View } from '@react-pdf/renderer';
import type { EntryBlankProps } from '@/features/heritage/entry-blank';
import { BODY, DISPLAY, GOLD_3, INK, META, MUTE, PAPER_DEEP } from './pdfPrimitives';

type MailTo = EntryBlankProps['mailTo'];

function PanelColumn({
  heading,
  primary,
  secondary,
}: {
  heading: string;
  primary?: string | null;
  secondary?: string | null;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text
        style={{
          fontFamily: META,
          fontWeight: 500,
          fontSize: 7,
          letterSpacing: 2,
          textTransform: 'uppercase',
          color: GOLD_3,
          marginBottom: 6,
        }}
      >
        {heading}
      </Text>
      {primary && (
        <Text
          style={{
            fontFamily: DISPLAY,
            fontStyle: 'italic',
            fontWeight: 500,
            fontSize: 13,
            color: INK,
            lineHeight: 1.35,
          }}
        >
          {primary}
        </Text>
      )}
      {secondary && (
        <Text
          style={{
            fontFamily: BODY,
            fontSize: 8.5,
            color: MUTE,
            marginTop: 4,
          }}
        >
          {secondary}
        </Text>
      )}
    </View>
  );
}

/**
 * §VI Mail-to panel.
 *
 * Two columns of mailing instructions inside a bordered cream-deep block.
 * Each column has a tracked smallcaps heading + italic display primary line
 * + small body secondary line.
 *
 * Differs from Heritage's MailToPanel:
 * - Background is `--mz-paper-deep` rather than transparent — the panel
 *   reads as a designed callout against the warm cream page.
 * - No nested double-border (Heritage's "engraved" effect is not part of
 *   Magazine's vocabulary).
 */
export function MailToPanel({ mailTo }: { mailTo: MailTo }) {
  return (
    <View
      style={{
        marginTop: 12,
        borderWidth: 0.5,
        borderColor: INK,
        backgroundColor: PAPER_DEEP,
        padding: 12,
        flexDirection: 'row',
        gap: 20,
      }}
    >
      <PanelColumn
        heading="Mail entries to"
        primary={mailTo.secretaryName}
        secondary={[mailTo.poBox, mailTo.cityStateZip].filter(Boolean).join(' · ') || null}
      />
      <PanelColumn
        heading="Email PDF entries to"
        primary={mailTo.email}
        secondary={
          mailTo.emailSubject ? `Subject: ${mailTo.emailSubject}` : 'Include payment confirmation №'
        }
      />
    </View>
  );
}
