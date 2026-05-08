import { Text, View } from '@react-pdf/renderer';
import type { EntryBlankProps } from '../types';
import { BODY, CLARET, DISPLAY, INK, OrnamentRule, QUILL } from './pdfPrimitives';

type Props = Pick<
  EntryBlankProps,
  'clubName' | 'showTitle' | 'licenseLanguage' | 'dateRange' | 'entryCloseIso'
>;

export function EntryBlankHeader({
  clubName,
  showTitle,
  licenseLanguage,
  dateRange,
  entryCloseIso,
}: Props) {
  return (
    <View style={{ alignItems: 'center', paddingBottom: 10 }}>
      <Text
        style={{
          fontFamily: DISPLAY,
          fontStyle: 'italic',
          fontSize: 9,
          color: QUILL,
          letterSpacing: 0.3,
        }}
      >
        Official Entry Blank
      </Text>

      <Text
        style={{
          fontFamily: DISPLAY,
          fontWeight: 700,
          fontSize: 14,
          textTransform: 'uppercase',
          letterSpacing: 2.5,
          marginTop: 3,
          color: INK,
        }}
      >
        {clubName}
      </Text>

      <OrnamentRule />

      <Text
        style={{
          fontFamily: DISPLAY,
          fontStyle: 'italic',
          fontSize: 28,
          lineHeight: 1,
          marginTop: 3,
          color: INK,
        }}
      >
        {showTitle}
      </Text>

      <Text
        style={{
          fontFamily: BODY,
          fontSize: 8,
          letterSpacing: 2,
          textTransform: 'uppercase',
          color: QUILL,
          marginTop: 5,
        }}
      >
        {licenseLanguage} · {dateRange}
      </Text>

      <OrnamentRule color={CLARET} />

      {entryCloseIso && (
        <Text
          style={{
            fontFamily: DISPLAY,
            fontStyle: 'italic',
            fontSize: 9,
            color: QUILL,
            marginTop: 4,
          }}
        >
          Entries close{' '}
          <Text style={{ fontStyle: 'normal', color: INK }}>
            {formatCloseDateTime(entryCloseIso)}
          </Text>
          {'  ·  '}One dog per blank{'  ·  '}Please print clearly in ink
        </Text>
      )}
    </View>
  );
}

function formatCloseDateTime(iso: string): string {
  const d = new Date(iso + (iso.includes('T') ? '' : 'T00:00:00'));
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
}
