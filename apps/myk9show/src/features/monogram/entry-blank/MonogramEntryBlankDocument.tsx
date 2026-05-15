// Ensure fonts are registered before this module is imported.
import '@/features/premium/pdf/pdfFonts';

import { Document, Page, Text, View } from '@react-pdf/renderer';
import type { EntryBlankProps } from '@/features/heritage/entry-blank/types';
import { buildMonogram } from '../utils/buildMonogram';
import { AgreementSection } from './sections/AgreementSection';
import { ClassesEnteredSection } from './sections/ClassesEnteredSection';
import { DogParticularsSection } from './sections/DogParticularsSection';
import { EntryBlankHeader } from './sections/EntryBlankHeader';
import { FeesSection } from './sections/FeesSection';
import { MailToPanel } from './sections/MailToPanel';
import {
  DISPLAY,
  INK,
  MONO,
  OrnamentRule,
  PAPER,
  PAPER_DEEP,
  QUILL,
} from './sections/pdfPrimitives';
import { OwnerHandlerSection } from './sections/OwnerHandlerSection';

/**
 * Embossed-monogram bleed behind the entry blank — a large, semi-transparent
 * letterpress treatment matching the landing page's hero monogram. Rendered
 * as an absolutely-positioned plain-color block since @react-pdf cannot do
 * `background-clip: text`. We use a near-paper tone so the text on top stays
 * legible; print-time the bleed prints as a subtle tint rather than a heavy
 * solid block.
 */
function MonogramBleed({ letters }: { letters: string }) {
  return (
    <Text
      style={{
        position: 'absolute',
        top: '20%',
        left: '0%',
        right: '0%',
        textAlign: 'center',
        fontFamily: MONO,
        fontSize: 540,
        color: PAPER_DEEP,
        opacity: 0.55,
        lineHeight: 1,
        letterSpacing: -20,
      }}
    >
      {letters}
    </Text>
  );
}

export function MonogramEntryBlankDocument(props: EntryBlankProps) {
  const pad = 38;
  const letters = buildMonogram(props.clubName);

  return (
    <Document title={`Entry Blank — ${props.showTitle}`} author={props.clubName}>
      <Page
        size="LETTER"
        style={{
          backgroundColor: PAPER,
          paddingHorizontal: pad,
          paddingVertical: pad,
          fontFamily: 'Crimson Pro',
          fontSize: 10,
          color: INK,
          position: 'relative',
        }}
      >
        <MonogramBleed letters={letters} />

        <View style={{ flex: 1, paddingHorizontal: 8, paddingVertical: 6 }}>
          <EntryBlankHeader
            clubName={props.clubName}
            showTitle={props.showTitle}
            licenseLanguage={props.licenseLanguage}
            dateRange={props.dateRange}
            entryCloseIso={props.entryCloseIso}
          />

          <DogParticularsSection dog={props.dog} />
          <ClassesEnteredSection trials={props.trials} levelCells={props.levelCells} />
          <OwnerHandlerSection owner={props.owner} />
          <FeesSection fees={props.fees} />
          <AgreementSection agreementText={props.agreementText} />
          <MailToPanel mailTo={props.mailTo} />

          {props.closeDate && (
            <>
              <OrnamentRule />
              <Text
                style={{
                  fontFamily: DISPLAY,
                  fontStyle: 'italic',
                  fontSize: 8,
                  color: QUILL,
                  textAlign: 'center',
                  marginTop: 3,
                }}
              >
                Entries must be received by{' '}
                <Text style={{ fontStyle: 'normal', color: INK }}>{props.closeDate}</Text>
                {props.confirmationDate ? `. Confirmations posted ${props.confirmationDate}.` : '.'}
                {props.onlineEntryUrl ? ` Online entry available at ${props.onlineEntryUrl}` : ''}
              </Text>
            </>
          )}
        </View>
      </Page>
    </Document>
  );
}
