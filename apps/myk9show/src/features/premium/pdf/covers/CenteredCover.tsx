import { Image, Page, Text, View } from '@react-pdf/renderer';
import type { CoverContext } from './coverContext';

export function renderCenteredCover({
  t,
  data,
  dateRange,
  club,
  venue,
  org,
  monogram,
}: CoverContext) {
  return (
    <Page size="LETTER" style={{ backgroundColor: '#ffffff', padding: 0 }}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 64 }}>
        {/* Monogram — large display-serif initials, treated like a wax seal */}
        <Text
          style={{
            fontFamily: t.displayFont,
            fontSize: 96,
            color: t.accentColor,
            lineHeight: 1,
            marginBottom: 8,
          }}
        >
          {monogram}
        </Text>
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: t.secondaryColor,
            width: 80,
            marginBottom: 14,
          }}
        />
        {/* Optional small logo stamp — sits beneath the monogram, intentional */}
        {data.club.logoUrl && (
          <Image
            src={data.club.logoUrl}
            style={{ width: 36, height: 36, objectFit: 'contain', marginBottom: 28 }}
          />
        )}
        <Text
          style={{
            fontFamily: t.bodyFont,
            fontSize: 9,
            color: t.secondaryColor,
            textTransform: 'uppercase',
            letterSpacing: 4,
            marginBottom: 12,
          }}
        >
          {org} · Premium List
        </Text>
        <Text
          style={{
            fontFamily: t.displayFont,
            fontSize: 11,
            color: t.accentColor,
            textTransform: 'uppercase',
            letterSpacing: 3,
            marginBottom: 24,
          }}
        >
          {club}
        </Text>
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: t.secondaryColor,
            width: 60,
            marginBottom: 24,
          }}
        />
        <Text
          style={{
            fontFamily: t.displayFont,
            fontSize: 48,
            color: t.accentColor,
            textAlign: 'center',
            marginBottom: 16,
            lineHeight: 1.1,
          }}
        >
          {data.show.name}
        </Text>
        <Text
          style={{
            fontFamily: t.displayFont,
            fontStyle: 'italic',
            fontSize: 14,
            color: t.secondaryColor,
            textAlign: 'center',
            marginBottom: 8,
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
            }}
          >
            {venue}
          </Text>
        )}
      </View>
    </Page>
  );
}
