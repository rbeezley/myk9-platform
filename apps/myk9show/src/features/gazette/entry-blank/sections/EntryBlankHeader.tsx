import { Text, View } from '@react-pdf/renderer';
import type { EntryBlankProps } from '../types';
import {
  BROWN,
  DISPLAY,
  DoubleRule,
  Hairline,
  INK,
  META,
  QUILL,
} from './pdfPrimitives';
import { GAZETTE_DEFAULT_EDITION, GAZETTE_DEFAULT_VOLUME_ROMAN } from '../../tokens';

type Props = Pick<
  EntryBlankProps,
  'clubName' | 'showTitle' | 'licenseLanguage' | 'dateRange' | 'entryCloseIso'
>;

/**
 * Mini-masthead + entry-blank head: strip / italic title / sub-strip /
 * "Section C · Official Entry Blank" head with double-rule below.
 *
 * The auto-italic first-and-last-word rule (see GazetteMasthead web
 * primitive) is applied here directly via PDF text nodes — @react-pdf
 * doesn't support a single string with embedded `<Text>` italic spans
 * cleanly, so we splice the words and render three separate `<Text>` nodes
 * inline inside the headline.
 */
export function EntryBlankHeader({ clubName, showTitle, licenseLanguage, dateRange, entryCloseIso }: Props) {
  return (
    <View>
      {/* Top strip */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          paddingBottom: 3,
          borderBottomWidth: 0.4,
          borderBottomColor: BROWN,
        }}
      >
        <Text style={{ fontFamily: META, fontWeight: 500, fontSize: 7, color: BROWN, letterSpacing: 0.4 }}>
          VOL. {GAZETTE_DEFAULT_VOLUME_ROMAN} · NO {GAZETTE_DEFAULT_EDITION}
        </Text>
        <Text style={{ fontFamily: META, fontWeight: 500, fontSize: 7, color: BROWN, letterSpacing: 0.4 }}>
          OFFICIAL ENTRY BLANK · MAIL-IN
        </Text>
      </View>

      {/* Big italic title */}
      <View
        style={{
          alignItems: 'center',
          paddingTop: 8,
          paddingBottom: 6,
          borderBottomWidth: 1.2,
          borderBottomColor: INK,
        }}
      >
        <ItalicTitle clubName={clubName} />
      </View>

      {/* Sub-strip */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          paddingTop: 4,
          marginBottom: 12,
        }}
      >
        <Text style={{ fontFamily: META, fontWeight: 500, fontSize: 6.5, color: QUILL, letterSpacing: 0.4 }}>
          ESTABLISHED 1947
        </Text>
        <Text style={{ fontFamily: META, fontWeight: 500, fontSize: 6.5, color: QUILL, letterSpacing: 0.4 }}>
          {licenseLanguage}
        </Text>
        <Text style={{ fontFamily: META, fontWeight: 500, fontSize: 6.5, color: QUILL, letterSpacing: 0.4 }}>
          {dateRange}
        </Text>
      </View>

      {/* Section head */}
      <View
        style={{
          alignItems: 'center',
          paddingBottom: 8,
        }}
      >
        <Text
          style={{
            fontFamily: META,
            fontWeight: 600,
            fontSize: 7.5,
            letterSpacing: 2.2,
            textTransform: 'uppercase',
            color: BROWN,
            marginBottom: 6,
          }}
        >
          Section C · Official Entry Blank
        </Text>
        <Text
          style={{
            fontFamily: DISPLAY,
            fontWeight: 900,
            fontSize: 24,
            letterSpacing: -0.4,
            color: INK,
            lineHeight: 1,
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
            marginTop: 4,
          }}
        >
          One dog per blank · Print clearly in ink
        </Text>
        <DoubleRule color={INK} marginVertical={6} />
      </View>

      {entryCloseIso && (
        <View style={{ alignItems: 'center', marginBottom: 4 }}>
          <Text style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 9, color: QUILL }}>
            Entries close{' '}
            <Text style={{ fontStyle: 'normal', color: INK }}>{formatCloseDate(entryCloseIso)}</Text>
          </Text>
        </View>
      )}
      <Hairline marginVertical={4} />
    </View>
  );
}

function ItalicTitle({ clubName }: { clubName: string }) {
  const words = clubName.trim().split(/\s+/);
  if (words.length < 3) {
    return (
      <Text style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 30, letterSpacing: -0.4, color: INK }}>
        {clubName}
      </Text>
    );
  }
  const first = words[0];
  const last = words[words.length - 1];
  const middle = words.slice(1, -1).join(' ');
  return (
    <Text style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 30, letterSpacing: -0.4, color: INK }}>
      <Text style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontWeight: 400 }}>{first}</Text>
      {` ${middle} `}
      <Text style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontWeight: 400 }}>{last}</Text>
    </Text>
  );
}

function formatCloseDate(iso: string): string {
  const d = new Date(iso + (iso.includes('T') ? '' : 'T00:00:00'));
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
}
