import { Page, Text, View } from '@react-pdf/renderer';
import type { CoverContext } from './coverContext';

export function renderTopblockCover({
  t,
  data,
  dateRange,
  club,
  venue,
  org,
  monogram,
}: CoverContext) {
  // No logo on cover — typography carries the brand. White surface with a
  // narrow accent ribbon at the top so the cover is print-friendly (no large
  // ink-heavy fills). The upload (if any) appears as a small corner mark.
  return (
    <Page size="LETTER" style={{ backgroundColor: '#ffffff', padding: 0 }}>
      {/* Thin accent ribbon — visual identity without burning toner */}
      <View style={{ height: 6, backgroundColor: t.accentColor }} />
      <View style={{ paddingHorizontal: 44, paddingTop: 64, paddingBottom: 32 }}>
        <Text
          style={{
            fontFamily: t.bodyFont,
            fontSize: 8,
            color: t.secondaryColor,
            textTransform: 'uppercase',
            letterSpacing: 2,
            marginBottom: 32,
          }}
        >
          {org} Premium · {dateRange}
        </Text>
        <Text
          style={{
            fontFamily: t.displayFont,
            fontWeight: 700,
            fontSize: 56,
            color: t.accentColor,
            lineHeight: 1.0,
            marginBottom: 24,
          }}
        >
          {data.show.name}
        </Text>
        <Text
          style={{
            fontFamily: t.displayFont,
            fontWeight: 500,
            fontSize: 14,
            color: t.secondaryColor,
          }}
        >
          Hosted by {club}
        </Text>
      </View>
      <View style={{ paddingHorizontal: 44, paddingTop: 32, flex: 1 }}>
        <View
          style={{
            flexDirection: 'row',
            gap: 32,
            marginTop: 16,
            marginBottom: 24,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontFamily: t.bodyFont,
                fontSize: 7,
                color: t.secondaryColor,
                textTransform: 'uppercase',
                letterSpacing: 1.5,
                marginBottom: 6,
              }}
            >
              Venue
            </Text>
            <Text
              style={{
                fontFamily: t.displayFont,
                fontWeight: 500,
                fontSize: 14,
                color: t.accentColor,
              }}
            >
              {venue || 'TBD'}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontFamily: t.bodyFont,
                fontSize: 7,
                color: t.secondaryColor,
                textTransform: 'uppercase',
                letterSpacing: 1.5,
                marginBottom: 6,
              }}
            >
              Dates
            </Text>
            <Text
              style={{
                fontFamily: t.displayFont,
                fontWeight: 500,
                fontSize: 14,
                color: t.accentColor,
              }}
            >
              {dateRange}
            </Text>
          </View>
        </View>
        {/* Bottom-right monogram stamp — subtle club identifier */}
        <Text
          style={{
            fontFamily: t.displayFont,
            fontWeight: 700,
            fontSize: 32,
            color: t.secondaryColor,
            opacity: 0.4,
            position: 'absolute',
            right: 44,
            bottom: 44,
          }}
        >
          {monogram}
        </Text>
      </View>
    </Page>
  );
}
