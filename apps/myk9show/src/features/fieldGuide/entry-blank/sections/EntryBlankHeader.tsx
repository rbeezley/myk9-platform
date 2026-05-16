import { Text, View } from '@react-pdf/renderer';
import type { EntryBlankProps } from '@/features/heritage/entry-blank/types';
import {
  BODY,
  DISPLAY,
  INK,
  MONO,
  ORANGE,
  ORANGE_DEEP,
  PAPER,
  PAPER_DEEP,
  PdfChip,
} from './pdfPrimitives';

type Props = Pick<
  EntryBlankProps,
  'clubName' | 'showTitle' | 'licenseLanguage' | 'dateRange' | 'entryCloseIso'
> & {
  /** Compact show identifier — e.g. "BCKC.2026.SS". Derived upstream. */
  showCode: string;
};

/**
 * Field Guide entry-blank header. Top dark ID strip ("REGISTRY · CODE ·
 * OFFICIAL ENTRY BLANK") above a parchment header block carrying chips,
 * the IBM Plex Sans 700 show title, and a mono-orange byline.
 *
 * Mirrors the design mock's combined `<div class="top-strip">` +
 * `<header class="head">` blocks.
 */
export function EntryBlankHeader({
  clubName,
  showTitle,
  licenseLanguage,
  dateRange,
  entryCloseIso,
  showCode,
}: Props) {
  return (
    <View>
      {/* ── Dark ID strip ── */}
      <View
        style={{
          backgroundColor: PAPER_DEEP,
          padding: '6 14',
          marginHorizontal: -8,
          marginTop: -6,
          marginBottom: 10,
          flexDirection: 'row',
          justifyContent: 'space-between',
        }}
      >
        <Text
          style={{
            fontFamily: MONO,
            fontWeight: 500,
            fontSize: 7,
            letterSpacing: 0.5,
            color: PAPER,
          }}
        >
          <Text style={{ color: ORANGE, fontWeight: 700 }}>{showCode}</Text> ·{' '}
          {licenseLanguage} · OFFICIAL ENTRY BLANK
        </Text>
        <Text
          style={{
            fontFamily: MONO,
            fontWeight: 500,
            fontSize: 7,
            letterSpacing: 0.5,
            color: PAPER,
          }}
        >
          REV 01 · MAIL-IN
        </Text>
      </View>

      {/* ── Parchment header ── */}
      <View
        style={{
          padding: '4 0 10',
          borderBottomWidth: 1.5,
          borderBottomColor: INK,
          marginBottom: 10,
        }}
      >
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
          <PdfChip variant="orange">ENTRY BLANK</PdfChip>
          <PdfChip>MAIL-IN PATH</PdfChip>
          <PdfChip>ONE DOG / BLANK</PdfChip>
          <PdfChip>PRINT IN INK</PdfChip>
        </View>
        <Text
          style={{
            fontFamily: DISPLAY,
            fontWeight: 700,
            fontSize: 22,
            letterSpacing: -0.5,
            color: INK,
            lineHeight: 1.0,
            marginBottom: 4,
          }}
        >
          {showTitle}
        </Text>
        <Text
          style={{
            fontFamily: MONO,
            fontWeight: 500,
            fontSize: 8,
            letterSpacing: 0.5,
            color: ORANGE_DEEP,
            textTransform: 'uppercase',
          }}
        >
          {clubName} · {dateRange}
          {entryCloseIso ? ` · ENTRIES CLOSE ${formatCloseDate(entryCloseIso)}` : ''}
        </Text>
        <Text
          style={{
            fontFamily: BODY,
            fontSize: 8,
            color: INK,
            opacity: 0.7,
            marginTop: 6,
          }}
        >
          Reference document for entrants. Use before entry to confirm levels, fees, and dates;
          use on site for venue, vet, schedule.
        </Text>
      </View>
    </View>
  );
}

function formatCloseDate(iso: string): string {
  const d = new Date(iso + (iso.includes('T') ? '' : 'T00:00:00'));
  return d
    .toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
    .toUpperCase();
}
