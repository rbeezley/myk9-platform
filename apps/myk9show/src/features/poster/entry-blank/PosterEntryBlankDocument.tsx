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
import { BODY, INK, MONO, MUTE, PAPER } from './sections/pdfPrimitives';

export type PosterEntryBlankProps = EntryBlankProps;

/**
 * Poster entry-blank PDF — single-page US Letter document mirroring the
 * web landing page's typographic register but rendered in @react-pdf
 * primitives.
 *
 * Critical font note: Archivo Black (the web display font) is replaced
 * with Inter Tight 800/900 throughout this document. See the comment
 * block at the top of `sections/pdfPrimitives.tsx` for context.
 */
export function PosterEntryBlankDocument(props: PosterEntryBlankProps) {
  const pad = 38;

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
                fontFamily: MONO,
                fontWeight: 500,
                fontSize: 7,
                letterSpacing: 1.4,
                color: MUTE,
                textAlign: 'center',
                marginTop: 10,
                paddingTop: 8,
                borderTopWidth: 0.5,
                borderTopColor: INK,
              }}
            >
              CLOSES {props.closeDate.toUpperCase()}
              {props.confirmationDate
                ? ` · CONFIRMATIONS ${props.confirmationDate.toUpperCase()}`
                : ''}
              {props.onlineEntryUrl ? ` · ONLINE: ${props.onlineEntryUrl.toUpperCase()}` : ''}
            </Text>
          )}
        </View>
      </Page>
    </Document>
  );
}
