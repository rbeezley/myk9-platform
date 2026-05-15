import '@/features/premium/pdf/pdfFonts';

import { Document, Page, Text, View } from '@react-pdf/renderer';
import type { EntryBlankProps } from '@/features/heritage/entry-blank/types';
import { deriveBannerBrandColors } from '../hooks/useBannerBrandColor';
import { AgreementSection } from './sections/AgreementSection';
import { ClassesEnteredSection } from './sections/ClassesEnteredSection';
import { DogParticularsSection } from './sections/DogParticularsSection';
import { EntryBlankHeader } from './sections/EntryBlankHeader';
import { FeesSection } from './sections/FeesSection';
import { MailToPanel } from './sections/MailToPanel';
import { BODY, INK, MUTE, PAPER } from './sections/pdfPrimitives';
import { OwnerHandlerSection } from './sections/OwnerHandlerSection';

export interface BannerEntryBlankProps extends EntryBlankProps {
  /** Per-club flag color hex from show.brand_color. Defaults to deep teal
   *  when null/undefined via deriveBannerBrandColors. */
  brandColor?: string | null | undefined;
}

export function BannerEntryBlankDocument(props: BannerEntryBlankProps) {
  const pad = 38;
  const { flag, textOnFlag } = deriveBannerBrandColors(props.brandColor);

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
            flag={flag}
            textOnFlag={textOnFlag}
          />

          <DogParticularsSection dog={props.dog} flag={flag} />
          <ClassesEnteredSection trials={props.trials} levelCells={props.levelCells} flag={flag} />
          <OwnerHandlerSection owner={props.owner} flag={flag} />
          <FeesSection fees={props.fees} flag={flag} />
          <AgreementSection agreementText={props.agreementText} flag={flag} />
          <MailToPanel mailTo={props.mailTo} flag={flag} />

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
              <Text style={{ color: INK, fontWeight: 500 }}>{props.closeDate}</Text>
              {props.confirmationDate ? `. Confirmations posted ${props.confirmationDate}.` : '.'}
              {props.onlineEntryUrl ? ` Online entry available at ${props.onlineEntryUrl}` : ''}
            </Text>
          )}
        </View>
      </Page>
    </Document>
  );
}
