import { Image, Page, Text, View } from '@react-pdf/renderer';
import { STYLE_TOKENS, type StyleTokens, buildMonogram, formatDate } from './pdfStyles';
import type { GeneratedPremium } from '../../../types/premium-types';

interface HeroCoverProps {
  data: GeneratedPremium;
}

interface CoverContext {
  t: StyleTokens;
  data: GeneratedPremium;
  dateRange: string;
  club: string;
  venue: string;
  org: string;
  monogram: string;
}

function assertNever(x: never): never {
  throw new Error(`Unhandled coverStyle: ${String(x)}`);
}

/**
 * Cover page for the premium list. Three structurally different layouts —
 * picked by style — designed to look intentional regardless of upload quality.
 *
 * - monogram: typographic monogram + hairline gold rule + small logo stamp
 * - banner: full-bleed top color band, no logo (typography carries it)
 * - headline: lower-third editorial layout, no logo (pure type-driven)
 *
 * The 5 new style tokens (magazine, poster, gazette, fieldGuide, heritage)
 * still render through the centered cover branch in Phase 1 — Phase 2 adds
 * dedicated branches for each new coverStyle.
 */
export function HeroCover({ data }: HeroCoverProps) {
  const t = STYLE_TOKENS[data.style];
  const dateRange =
    data.show.endDate && data.show.endDate !== data.show.startDate
      ? `${formatDate(data.show.startDate)} – ${formatDate(data.show.endDate)}`
      : formatDate(data.show.startDate);
  const club = data.club.name ?? 'Host Club';
  const venue = data.show.venue ?? '';
  const org = data.org;
  const monogram = buildMonogram(club);

  const ctx: CoverContext = { t, data, dateRange, club, venue, org, monogram };

  switch (t.coverStyle) {
    case 'centered':
      return renderCenteredCover(ctx);
    case 'topblock':
      return renderTopblockCover(ctx);
    case 'lowerthird':
      return renderLowerthirdCover(ctx);
    case 'editorial':
    case 'poster':
    case 'masthead':
    case 'fieldindex':
    case 'engraved':
      // Phase 1: stub styles fall back to the centered layout until Phases 2–4
      // add their own renderers. Their tokens are clones of monogram so the
      // output is intentional, not accidental.
      return renderCenteredCover(ctx);
    default:
      return assertNever(t.coverStyle);
  }
}

function renderCenteredCover({ t, data, dateRange, club, venue, org, monogram }: CoverContext) {
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

function renderTopblockCover({ t, data, dateRange, club, venue, org, monogram }: CoverContext) {
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

function renderLowerthirdCover({ t, data, dateRange, club, venue, org }: CoverContext) {
  // Lower-third editorial layout, type-only — small uppercase masthead at the
  // top, oversized show name anchored to the bottom-left.
  return (
    <Page size="LETTER" style={{ backgroundColor: '#ffffff', padding: 0 }}>
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
