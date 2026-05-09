import { Page, Text, View } from '@react-pdf/renderer';
import type { CoverContext } from './coverContext';
import { PdfFooter } from '../PdfFooter';

export function renderLowerthirdCover({ t, data, dateRange, club, venue, org }: CoverContext) {
  // Lower-third editorial layout, type-only — small uppercase masthead at the
  // top, oversized show name anchored to the bottom-left.
  return (
    <Page size="LETTER" style={{ backgroundColor: '#ffffff', padding: 0 }}>
      <PdfFooter style={data.style} color={t.secondaryColor} />
      <View style={{ flex: 1, paddingHorizontal: 72, paddingTop: 72 }}>
        <Text
          style={{
            fontFamily: t.bodyFont,
            fontSize: 7,
            color: t.secondaryColor,
            textTransform: 'uppercase',
            letterSpacing: 4,
          }}
        >
          {club}
        </Text>
        <Text
          style={{
            fontFamily: t.bodyFont,
            fontSize: 7,
            color: t.secondaryColor,
            textTransform: 'uppercase',
            letterSpacing: 4,
            marginTop: 4,
          }}
        >
          {org} Premium List
        </Text>
      </View>
      <View
        style={{
          paddingHorizontal: 72,
          paddingBottom: 72,
        }}
      >
        <View
          style={{
            borderTopWidth: 0.5,
            borderTopColor: t.secondaryColor,
            paddingTop: 32,
          }}
        >
          <Text
            style={{
              fontFamily: t.displayFont,
              fontSize: 64,
              color: t.accentColor,
              lineHeight: 0.95,
              marginBottom: 24,
            }}
          >
            {data.show.name}
          </Text>
          <View style={{ flexDirection: 'row', gap: 48 }}>
            <View>
              <Text
                style={{
                  fontFamily: t.bodyFont,
                  fontSize: 7,
                  color: t.secondaryColor,
                  textTransform: 'uppercase',
                  letterSpacing: 2,
                  marginBottom: 4,
                }}
              >
                Dates
              </Text>
              <Text style={{ fontFamily: t.displayFont, fontSize: 13, color: t.textColor }}>
                {dateRange}
              </Text>
            </View>
            {venue && (
              <View>
                <Text
                  style={{
                    fontFamily: t.bodyFont,
                    fontSize: 7,
                    color: t.secondaryColor,
                    textTransform: 'uppercase',
                    letterSpacing: 2,
                    marginBottom: 4,
                  }}
                >
                  Venue
                </Text>
                <Text style={{ fontFamily: t.displayFont, fontSize: 13, color: t.textColor }}>
                  {venue}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </Page>
  );
}
