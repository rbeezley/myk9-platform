// Ensure fonts are registered before this module is imported.
import '../../premium/pdf/pdfFonts';

import { Document, Page, Text, View } from '@react-pdf/renderer';
import type { EntryBlankProps } from './types';
import { EntryBlankHeader } from './sections/EntryBlankHeader';
import { DogParticularsSection } from './sections/DogParticularsSection';
import { ClassesEnteredSection } from './sections/ClassesEnteredSection';
import { OwnerHandlerSection } from './sections/OwnerHandlerSection';
import { FeesSection } from './sections/FeesSection';
import { AgreementSection } from './sections/AgreementSection';
import { MailToPanel } from './sections/MailToPanel';
import { BODY, BROWN, DISPLAY, DoubleRule, INK, META, PAPER, QUILL } from './sections/pdfPrimitives';

/**
 * Gazette mail-in entry blank. US Letter portrait, single page,
 * print-ready. Body font is registered Source Serif 4 (lining figures —
 * see pdfPrimitives.tsx for the @react-pdf font-feature-settings carve-out).
 */
export function GazetteEntryBlankDocument(props: EntryBlankProps) {
  const padH = 36;
  const padV = 28;

  return (
    <Document title={`Entry Blank — ${props.showTitle}`} author={props.clubName}>
      <Page
        size="LETTER"
        style={{
          backgroundColor: PAPER,
          paddingHorizontal: padH,
          paddingVertical: padV,
          fontFamily: BODY,
          fontSize: 9,
          color: INK,
        }}
      >
        <View>
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

          {/* Foot rule */}
          <DoubleRule color={INK} marginVertical={6} />
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              paddingTop: 2,
            }}
          >
            {props.closeDate && (
              <Text style={{ fontFamily: META, fontWeight: 500, fontSize: 6.5, letterSpacing: 1.4, color: BROWN }}>
                CLOSES {props.closeDate.toUpperCase()}
              </Text>
            )}
            {props.onlineEntryUrl && (
              <Text style={{ fontFamily: META, fontWeight: 500, fontSize: 6.5, letterSpacing: 1.4, color: BROWN }}>
                ONLINE · {props.onlineEntryUrl.toUpperCase()}
              </Text>
            )}
            <Text style={{ fontFamily: META, fontWeight: 500, fontSize: 6.5, letterSpacing: 1.4, color: BROWN }}>
              PAGE i · CONTINUED ▸
            </Text>
          </View>

          {props.confirmationDate && (
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
              Confirmations posted {props.confirmationDate}.
            </Text>
          )}
        </View>
      </Page>
    </Document>
  );
}
