import { Text, View } from '@react-pdf/renderer';
import type { EntryBlankProps } from '@/features/heritage/entry-blank/types';
import { BODY, DISPLAY, INK, MONO, MUTE, PAPER, RED } from './pdfPrimitives';

type Props = Pick<
  EntryBlankProps,
  'clubName' | 'showTitle' | 'licenseLanguage' | 'dateRange' | 'entryCloseIso'
>;

/**
 * Poster entry-blank header — top mono strip + masthead with the show
 * title in oversized Inter Tight 900 (Archivo Black substitute) and a
 * dates/license sub-line in Inter Tight 800.
 *
 * Two parts:
 *   1. Top ink strip: mono "OFFICIAL ENTRY · MAIL-IN · SS'26 BCKC" left,
 *      "LICENSE №…" right.
 *   2. Cream masthead: red mono kicker, giant title, sub-headline.
 */
export function EntryBlankHeader({
  clubName,
  showTitle,
  licenseLanguage,
  dateRange,
  entryCloseIso,
}: Props) {
  const closeLabel = entryCloseIso ? formatCloseDate(entryCloseIso) : null;
  const upperShow = showTitle.toUpperCase();
  const upperClub = clubName.toUpperCase();

  return (
    <View>
      {/* Top mono strip */}
      <View
        style={{
          backgroundColor: INK,
          paddingHorizontal: 12,
          paddingVertical: 6,
          marginHorizontal: -8,
          marginTop: -6,
          flexDirection: 'row',
          justifyContent: 'space-between',
        }}
      >
        <Text
          style={{
            fontFamily: MONO,
            fontWeight: 500,
            fontSize: 7,
            letterSpacing: 1.4,
            color: PAPER,
          }}
        >
          OFFICIAL ENTRY · MAIL-IN · {upperClub}
        </Text>
        <Text
          style={{
            fontFamily: MONO,
            fontWeight: 500,
            fontSize: 7,
            letterSpacing: 1.4,
            color: PAPER,
          }}
        >
          {licenseLanguage.toUpperCase()}
        </Text>
      </View>

      {/* Cream masthead */}
      <View
        style={{
          paddingHorizontal: 4,
          paddingVertical: 14,
          borderBottomWidth: 1.5,
          borderBottomColor: INK,
          marginBottom: 10,
        }}
      >
        <Text
          style={{
            fontFamily: MONO,
            fontWeight: 500,
            fontSize: 8,
            letterSpacing: 1.4,
            color: RED,
            marginBottom: 6,
          }}
        >
          OFFICIAL ENTRY BLANK · MAIL-IN
        </Text>
        <Text
          style={{
            fontFamily: DISPLAY,
            fontWeight: 900,
            fontSize: 32,
            letterSpacing: -1,
            color: INK,
            lineHeight: 0.95,
            marginBottom: 6,
          }}
        >
          {upperShow}
        </Text>
        <Text
          style={{
            fontFamily: DISPLAY,
            fontWeight: 800,
            fontSize: 10,
            letterSpacing: -0.2,
            color: INK,
          }}
        >
          {dateRange}
          {closeLabel ? ` · CLOSES ${closeLabel.toUpperCase()}` : ''}
        </Text>
        <Text
          style={{
            fontFamily: BODY,
            fontWeight: 500,
            fontSize: 7.5,
            letterSpacing: 0.6,
            color: MUTE,
            marginTop: 4,
          }}
        >
          One dog per blank · Please print clearly in ink
        </Text>
      </View>
    </View>
  );
}

function formatCloseDate(iso: string): string {
  try {
    const d = new Date(iso + (iso.includes('T') ? '' : 'T00:00:00'));
    return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}
