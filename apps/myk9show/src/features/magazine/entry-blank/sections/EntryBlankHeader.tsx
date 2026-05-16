import { Text, View } from '@react-pdf/renderer';
import type { EntryBlankProps } from '@/features/heritage/entry-blank';
import { BODY, DISPLAY, GoldRule, INK, META, MUTE } from './pdfPrimitives';

type Props = Pick<
  EntryBlankProps,
  'clubName' | 'showTitle' | 'licenseLanguage' | 'dateRange' | 'entryCloseIso'
>;

function formatCloseDateTime(iso: string): string {
  const d = new Date(iso + (iso.includes('T') ? '' : 'T00:00:00'));
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Magazine entry-blank header.
 *
 * Two-column header (matching the design handoff's `.head` block):
 * - Left column: tracked smallcaps edition slug, oversized Cormorant
 *   Garamond title with italic accent on the trailing word, italic
 *   "An AKC Licensed Trial · …" dek
 * - Right column: top-right "AKC License" caption + display-italic license
 *   number
 *
 * The italic accent on the trailing title word is approximated via two
 * sibling `<Text>` nodes — the runtime does not honor `text-decoration` or
 * `background-clip` for partial-word styling.
 */
export function EntryBlankHeader({
  clubName,
  showTitle,
  licenseLanguage,
  dateRange,
  entryCloseIso,
}: Props) {
  const words = showTitle.trim().split(' ');
  const leading = words.length > 1 ? words.slice(0, -1).join(' ') : '';
  const trailing = words[words.length - 1] ?? showTitle;

  return (
    <View style={{ marginBottom: 4 }}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          paddingBottom: 10,
          borderBottomWidth: 0.5,
          borderBottomColor: INK,
        }}
      >
        <View style={{ flex: 1, paddingRight: 16 }}>
          <Text
            style={{
              fontFamily: META,
              fontWeight: 500,
              fontSize: 7.5,
              letterSpacing: 2,
              textTransform: 'uppercase',
              color: MUTE,
              marginBottom: 6,
            }}
          >
            Official Entry Blank · Mail-In
          </Text>

          {/* Two-piece title: plain leading + italic gold trailing word. */}
          <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' }}>
            {leading && (
              <Text
                style={{
                  fontFamily: DISPLAY,
                  fontWeight: 500,
                  fontSize: 30,
                  letterSpacing: -0.5,
                  color: INK,
                  lineHeight: 0.95,
                }}
              >
                {leading}{' '}
              </Text>
            )}
            <Text
              style={{
                fontFamily: DISPLAY,
                fontWeight: 500,
                fontStyle: 'italic',
                fontSize: 30,
                letterSpacing: -0.5,
                color: '#4a3826',
                lineHeight: 0.95,
              }}
            >
              {trailing}
            </Text>
          </View>

          <Text
            style={{
              fontFamily: DISPLAY,
              fontStyle: 'italic',
              fontSize: 10,
              color: MUTE,
              marginTop: 6,
            }}
          >
            {licenseLanguage} · {dateRange} · {clubName}
          </Text>
        </View>

        <View style={{ alignItems: 'flex-end' }}>
          <Text
            style={{
              fontFamily: META,
              fontWeight: 500,
              fontSize: 7.5,
              letterSpacing: 2,
              textTransform: 'uppercase',
              color: MUTE,
            }}
          >
            AKC License
          </Text>
          {entryCloseIso && (
            <Text
              style={{
                fontFamily: DISPLAY,
                fontStyle: 'italic',
                fontSize: 11,
                color: INK,
                marginTop: 2,
              }}
            >
              Closes {formatCloseDateTime(entryCloseIso)}
            </Text>
          )}
        </View>
      </View>

      <GoldRule />

      {entryCloseIso && (
        <Text
          style={{
            fontFamily: BODY,
            fontSize: 8,
            color: MUTE,
            marginTop: 4,
            textAlign: 'center',
          }}
        >
          One blank per dog · Please print clearly in ink
        </Text>
      )}
    </View>
  );
}
