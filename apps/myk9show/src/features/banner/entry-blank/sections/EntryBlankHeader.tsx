import { Text, View } from '@react-pdf/renderer';
import type { EntryBlankProps } from '@/features/heritage/entry-blank/types';
import { BODY, DISPLAY } from './pdfPrimitives';

type Props = Pick<
  EntryBlankProps,
  'clubName' | 'showTitle' | 'licenseLanguage' | 'dateRange' | 'entryCloseIso'
> & {
  flag: string;
  textOnFlag: string;
};

/**
 * Banner entry-blank header — a full-bleed flag-bar masthead at the top
 * of the page, mirroring the landing page's signature element. Carries
 * the club name and the giant Inter Tight 900 show title in left-aligned
 * stacking, with the registry meta and close date in a small right column.
 */
export function EntryBlankHeader({
  clubName,
  showTitle,
  licenseLanguage,
  dateRange,
  entryCloseIso,
  flag,
  textOnFlag,
}: Props) {
  return (
    <View
      style={{
        backgroundColor: flag,
        padding: '14px 18px',
        marginHorizontal: -8,
        marginTop: -6,
        marginBottom: 10,
      }}
    >
      <Text
        style={{
          fontFamily: BODY,
          fontWeight: 500,
          fontSize: 7,
          letterSpacing: 1.8,
          color: textOnFlag,
          opacity: 0.75,
          marginBottom: 4,
        }}
      >
        OFFICIAL ENTRY BLANK · {clubName.toUpperCase()}
      </Text>
      <Text
        style={{
          fontFamily: DISPLAY,
          fontWeight: 900,
          fontSize: 22,
          letterSpacing: -0.5,
          color: textOnFlag,
          lineHeight: 1.05,
          marginBottom: 4,
        }}
      >
        {showTitle}
      </Text>
      <Text
        style={{
          fontFamily: BODY,
          fontSize: 9,
          color: textOnFlag,
          opacity: 0.85,
        }}
      >
        {licenseLanguage} · {dateRange}
        {entryCloseIso ? ` · Entries close ${formatCloseDate(entryCloseIso)}` : ''}
      </Text>
      <Text
        style={{
          fontFamily: BODY,
          fontWeight: 500,
          fontSize: 6.5,
          letterSpacing: 1.6,
          color: textOnFlag,
          opacity: 0.6,
          marginTop: 6,
        }}
      >
        ONE DOG PER BLANK · PLEASE PRINT CLEARLY IN INK
      </Text>
    </View>
  );
}

function formatCloseDate(iso: string): string {
  const d = new Date(iso + (iso.includes('T') ? '' : 'T00:00:00'));
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
}
