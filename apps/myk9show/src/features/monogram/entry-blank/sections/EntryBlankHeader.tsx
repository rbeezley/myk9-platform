import { Text, View } from '@react-pdf/renderer';
import type { EntryBlankProps } from '@/features/heritage/entry-blank/types';
import { buildMonogram } from '../../utils/buildMonogram';
import { BODY, BRONZE, DISPLAY, INK, MONO, MUTE, OrnamentRule, QUILL } from './pdfPrimitives';

type Props = Pick<
  EntryBlankProps,
  'clubName' | 'showTitle' | 'licenseLanguage' | 'dateRange' | 'entryCloseIso'
>;

/**
 * Monogram entry-blank header. Three-column grid: 56pt embossed monogram on
 * the left, italic Bodoni Moda title block in the middle, small-caps
 * registry meta on the right. Mirrors the `.head` block in the design
 * handoff (Monogram Entry Blank.html).
 */
export function EntryBlankHeader({
  clubName,
  showTitle,
  licenseLanguage,
  dateRange,
  entryCloseIso,
}: Props) {
  const letters = buildMonogram(clubName);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingBottom: 10,
        borderBottomWidth: 0.5,
        borderBottomColor: INK,
        marginBottom: 8,
      }}
    >
      {/* Left — 56pt solid-ink monogram */}
      <Text
        style={{
          fontFamily: MONO,
          fontSize: 56,
          color: INK,
          letterSpacing: -2,
          marginRight: 14,
          lineHeight: 1,
        }}
      >
        {letters}
      </Text>

      {/* Center — title block */}
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontFamily: BODY,
            fontSize: 7,
            fontWeight: 500,
            letterSpacing: 2.5,
            textTransform: 'uppercase',
            color: BRONZE,
            marginBottom: 2,
          }}
        >
          Official Entry Blank · {clubName}
        </Text>
        <Text
          style={{
            fontFamily: DISPLAY,
            fontSize: 22,
            letterSpacing: -0.3,
            lineHeight: 1.05,
            color: INK,
          }}
        >
          {showTitle}
        </Text>
        <Text
          style={{
            fontFamily: DISPLAY,
            fontStyle: 'italic',
            fontSize: 10,
            color: QUILL,
            marginTop: 3,
          }}
        >
          {licenseLanguage} · {dateRange}
        </Text>
      </View>

      {/* Right — registry meta */}
      <View style={{ alignItems: 'flex-end', maxWidth: 140 }}>
        <Text
          style={{
            fontFamily: BODY,
            fontSize: 6.5,
            letterSpacing: 2,
            textTransform: 'uppercase',
            color: MUTE,
            marginBottom: 2,
            textAlign: 'right',
          }}
        >
          One dog per blank
        </Text>
        {entryCloseIso && (
          <Text
            style={{
              fontFamily: DISPLAY,
              fontStyle: 'italic',
              fontSize: 9,
              color: INK,
              textAlign: 'right',
              lineHeight: 1.3,
            }}
          >
            Entries close {formatCloseDateTime(entryCloseIso)}
          </Text>
        )}
        <View style={{ marginTop: 4 }}>
          <OrnamentRule />
        </View>
      </View>
    </View>
  );
}

function formatCloseDateTime(iso: string): string {
  const d = new Date(iso + (iso.includes('T') ? '' : 'T00:00:00'));
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
}
