// Ensure fonts are registered before this module is imported.
import '../../../features/premium/pdf/pdfFonts';

import { Document, Page, Text, View } from '@react-pdf/renderer';
import type { EntryBlankProps } from './types';
import { AgreementSection } from './sections/AgreementSection';
import { ClassesEnteredSection } from './sections/ClassesEnteredSection';
import { DogParticularsSection } from './sections/DogParticularsSection';
import { EntryBlankHeader } from './sections/EntryBlankHeader';
import { FeesSection } from './sections/FeesSection';
import { MailToPanel } from './sections/MailToPanel';
import { OrnamentRule, DISPLAY, QUILL, INK, PAPER } from './sections/pdfPrimitives';
import { OwnerHandlerSection } from './sections/OwnerHandlerSection';

// Engraved double border — two nested absolute Views matching the EngravedCover pattern.
function EngravedFrame() {
  const inset = 18;
  const inner = 5;
  return (
    <>
      <View
        style={{
          position: 'absolute',
          top: inset,
          left: inset,
          right: inset,
          bottom: inset,
          borderWidth: 0.75,
          borderColor: INK,
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: inset + inner,
          left: inset + inner,
          right: inset + inner,
          bottom: inset + inner,
          borderWidth: 0.4,
          borderColor: INK,
        }}
      />
    </>
  );
}

export function HeritageEntryBlankDocument(props: EntryBlankProps) {
  const pad = 38;

  return (
    <Document title={`Entry Blank — ${props.showTitle}`} author={props.clubName}>
      <Page
        size="LETTER"
        style={{
          backgroundColor: PAPER,
          paddingHorizontal: pad,
          paddingVertical: pad,
          fontFamily: 'EB Garamond',
          fontSize: 10,
          color: INK,
          position: 'relative',
        }}
      >
        <EngravedFrame />

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

          {/* Footer */}
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
