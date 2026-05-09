import { Page, Text, View } from '@react-pdf/renderer';
import type { GeneratedPremium } from '../../../../types/premium-types';
import { numberToRoman, type StyleTokens } from '../pdfStyles';
import type { CoverContext } from './coverContext';
import { firstSentence } from './EditorialCover';
import { PdfFooter } from '../PdfFooter';

// ─── Engraved (Heritage) ─────────────────────────────────────────────────────
//
// Ivory page with a double-line border frame inset from each edge, ornamental
// rules above and below the show name, an EB Garamond display title, and a
// Roman-numeral folio centered at the foot.
export function renderEngravedCover({ t, data, dateRange, club, venue }: CoverContext) {
  const welcome = readWelcome(data);
  const inset = 36;
  const innerInset = 8;

  return (
    <Page size="LETTER" style={{ backgroundColor: t.surfaceColor, padding: 0 }}>
      <PdfFooter style={data.style} color={t.secondaryColor} />
      {/* Outer frame */}
      <View
        style={{
          position: 'absolute',
          top: inset,
          left: inset,
          right: inset,
          bottom: inset,
          borderWidth: 1.25,
          borderColor: t.accentColor,
        }}
      />
      {/* Inner frame */}
      <View
        style={{
          position: 'absolute',
          top: inset + innerInset,
          left: inset + innerInset,
          right: inset + innerInset,
          bottom: inset + innerInset,
          borderWidth: 0.5,
          borderColor: t.accentColor,
        }}
      />
      <View
        style={{
          flex: 1,
          paddingHorizontal: inset + innerInset + 36,
          paddingTop: inset + innerInset + 72,
          paddingBottom: inset + innerInset + 36,
          alignItems: 'center',
          justifyContent: 'flex-start',
        }}
      >
        <Text
          style={{
            fontFamily: t.bodyFont,
            fontSize: 8,
            color: t.accentDeep ?? t.accentColor,
            textTransform: 'uppercase',
            letterSpacing: 5,
            marginBottom: 24,
          }}
        >
          Premium List
        </Text>
        {renderOrnamentalRule(t)}
        <Text
          style={{
            fontFamily: t.displayFont,
            fontSize: 44,
            color: t.accentColor,
            textAlign: 'center',
            lineHeight: 1.1,
            marginVertical: 18,
          }}
        >
          {data.show.name}
        </Text>
        {renderOrnamentalRule(t)}
        <Text
          style={{
            fontFamily: t.displayFont,
            fontSize: 13,
            color: t.accentColor,
            textAlign: 'center',
            marginTop: 28,
            lineHeight: 1.5,
          }}
        >
          By way of Welcome to {club}
        </Text>
        {welcome && (
          <Text
            style={{
              fontFamily: t.displayFont,
              fontStyle: 'italic',
              fontSize: 12,
              color: t.textColor,
              textAlign: 'center',
              marginTop: 16,
              lineHeight: 1.5,
            }}
          >
            {firstSentence(welcome)}
          </Text>
        )}
        <Text
          style={{
            fontFamily: t.displayFont,
            fontSize: 11,
            color: t.secondaryColor,
            textAlign: 'center',
            marginTop: 24,
            letterSpacing: 1.5,
          }}
        >
          {dateRange}
        </Text>
        {venue && (
          <Text
            style={{
              fontFamily: t.bodyFont,
              fontSize: 10,
              color: t.textColor,
              textAlign: 'center',
              marginTop: 6,
            }}
          >
            {venue}
          </Text>
        )}
      </View>
      {/* Roman-numeral folio.
          Heritage cover is page 1; multi-page cover support is out of scope until pagination needs change. */}
      <Text
        style={{
          position: 'absolute',
          bottom: inset + innerInset + 14,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontFamily: t.displayFont,
          fontSize: 11,
          color: t.secondaryColor,
          letterSpacing: 3,
        }}
      >
        {numberToRoman(1)}
      </Text>
    </Page>
  );
}

function renderOrnamentalRule(tokens: StyleTokens) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        width: '70%',
      }}
    >
      <View
        style={{
          flex: 1,
          borderTopWidth: 0.5,
          borderTopColor: tokens.secondaryColor,
        }}
      />
      <Text
        style={{
          fontFamily: tokens.displayFont,
          fontSize: 12,
          color: tokens.accentDeep ?? tokens.accentColor,
          marginHorizontal: 10,
          lineHeight: 1,
        }}
      >
        {'§'}
      </Text>
      <View
        style={{
          flex: 1,
          borderTopWidth: 0.5,
          borderTopColor: tokens.secondaryColor,
        }}
      />
    </View>
  );
}

// Optional narrative field. The base GeneratedPremium type doesn't yet declare
// a welcome-from-chair string, but readers may pass one through richer fixture
// data. Read defensively so the cover gracefully ignores it when absent.
function readWelcome(data: GeneratedPremium): string | null {
  const candidate = (data as { welcomeFromChair?: unknown }).welcomeFromChair;
  if (typeof candidate !== 'string') return null;
  const trimmed = candidate.trim();
  return trimmed.length > 0 ? trimmed : null;
}
