import '@/features/premium/pdf/pdfFonts';

import { Document, Page, Text, View } from '@react-pdf/renderer';
import type { EntryBlankProps } from '@/features/heritage/entry-blank/types';
import { AgreementSection } from './sections/AgreementSection';
import { ClassesEnteredSection } from './sections/ClassesEnteredSection';
import { DogParticularsSection } from './sections/DogParticularsSection';
import { EntryBlankHeader } from './sections/EntryBlankHeader';
import { FeesSection } from './sections/FeesSection';
import { MailToPanel } from './sections/MailToPanel';
import { OwnerHandlerSection } from './sections/OwnerHandlerSection';
import { BODY, INK, MUTE, ORANGE_DEEP, PAPER } from './sections/pdfPrimitives';
import { deriveShowCode } from '../landing/utils/showCode';

export interface FieldGuideEntryBlankProps extends EntryBlankProps {
  /** Optional pre-derived show code. If omitted, derived from clubName +
   *  showTitle on render via the same heuristic the landing page uses. */
  showCode?: string;
}

/**
 * Field Guide entry-blank PDF. US Letter portrait, single page,
 * print-ready. The visual register matches the landing page surface:
 * dark ID strip, parchment header, §-numbered sections, indicator-orange
 * accents, IBM Plex Sans + Mono throughout. Serif (IBM Plex Serif)
 * appears in exactly one place — the §05 agreement block.
 */
export function FieldGuideEntryBlankDocument(props: FieldGuideEntryBlankProps) {
  const pad = 38;
  const showCode =
    props.showCode ??
    deriveShowCode(props.clubName, props.showTitle, props.entryCloseIso ?? null);

  return (
    <Document title={`Entry Blank — ${props.showTitle}`} author={props.clubName}>
      <Page
        size="LETTER"
        style={{
          backgroundColor: PAPER,
          paddingHorizontal: pad,
          paddingVertical: pad,
          fontFamily: BODY,
          fontSize: 10,
          color: INK,
        }}
      >
        <View style={{ flex: 1, paddingHorizontal: 8, paddingVertical: 6 }}>
          <EntryBlankHeader
            clubName={props.clubName}
            showTitle={props.showTitle}
            licenseLanguage={props.licenseLanguage}
            dateRange={props.dateRange}
            entryCloseIso={props.entryCloseIso}
            showCode={showCode}
          />

          <DogParticularsSection dog={props.dog} />
          <ClassesEnteredSection trials={props.trials} levelCells={props.levelCells} />
          <OwnerHandlerSection owner={props.owner} />
          <FeesSection fees={props.fees} />
          <AgreementSection agreementText={props.agreementText} />
          <MailToPanel mailTo={props.mailTo} />

          {props.closeDate && (
            <Text
              style={{
                fontFamily: BODY,
                fontSize: 8,
                color: MUTE,
                textAlign: 'center',
                marginTop: 10,
              }}
            >
              Entries must be received by{' '}
              <Text style={{ color: ORANGE_DEEP, fontWeight: 700 }}>{props.closeDate}</Text>
              {props.confirmationDate ? `. Confirmations posted ${props.confirmationDate}.` : '.'}
              {props.onlineEntryUrl ? ` Online entry at ${props.onlineEntryUrl}` : ''}
            </Text>
          )}
        </View>
      </Page>
    </Document>
  );
}
