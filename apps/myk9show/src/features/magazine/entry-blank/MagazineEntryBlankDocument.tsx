// Ensure fonts are registered before this module is imported. The
// shared pdfFonts module registers Cormorant Garamond, Source Serif 4, and
// Inter Tight — all three required by the Magazine PDF.
import '@/features/premium/pdf/pdfFonts';

import { Document, Page, Text, View } from '@react-pdf/renderer';
import type { EntryBlankProps } from '@/features/heritage/entry-blank';
import { AgreementSection } from './sections/AgreementSection';
import { ClassesEnteredSection } from './sections/ClassesEnteredSection';
import { DogParticularsSection } from './sections/DogParticularsSection';
import { EntryBlankHeader } from './sections/EntryBlankHeader';
import { FeesSection } from './sections/FeesSection';
import { MailToPanel } from './sections/MailToPanel';
import { OwnerHandlerSection } from './sections/OwnerHandlerSection';
import { BODY, DISPLAY, GoldRule, INK, MUTE, PAPER, QUILL } from './sections/pdfPrimitives';

/**
 * US Letter, single-page, mail-in entry blank.
 *
 * Layout flow (matching `Magazine Entry Blank.html`):
 *  1. Two-column header (edition slug + title left, license caption right)
 *  2. §I Particulars of the dog
 *  3. §II Classes entered (trial table + level grid)
 *  4. §III Owner & handler
 *  5. §IV Fees tendered
 *  6. §V Agreement & signature
 *  7. §VI Mail-to panel
 *  8. Foot rule (close date + slug + page number)
 *
 * No engraved double-border (that's Heritage's vocabulary). The Magazine
 * blank uses gold hairlines for separation and lets typography carry the
 * weight.
 */
export function MagazineEntryBlankDocument(props: EntryBlankProps) {
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
          fontSize: 9,
          color: INK,
        }}
      >
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

        <GoldRule />
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            paddingTop: 4,
          }}
        >
          <Text
            style={{
              fontFamily: 'Inter Tight',
              fontWeight: 500,
              fontSize: 7,
              letterSpacing: 1.8,
              textTransform: 'uppercase',
              color: MUTE,
            }}
          >
            {props.closeDate ? `Closes ${props.closeDate}` : 'Mail-in entry'}
          </Text>
          {props.onlineEntryUrl && (
            <Text
              style={{
                fontFamily: DISPLAY,
                fontStyle: 'italic',
                fontSize: 8,
                color: QUILL,
              }}
            >
              myK9Show · {props.onlineEntryUrl}
            </Text>
          )}
          <Text
            style={{
              fontFamily: 'Inter Tight',
              fontWeight: 500,
              fontSize: 7,
              letterSpacing: 1.8,
              textTransform: 'uppercase',
              color: MUTE,
            }}
          >
            Page i of i
          </Text>
        </View>
      </Page>
    </Document>
  );
}
