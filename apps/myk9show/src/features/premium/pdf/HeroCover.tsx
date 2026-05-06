import { Image, Page, Text, View } from '@react-pdf/renderer';
import { STYLE_TOKENS, type StyleTokens, buildMonogram, formatDate } from './pdfStyles';
import type { GeneratedPremium } from '../../../types/premium-types';
import { AtAGlancePanel } from './AtAGlancePanel';

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
      return renderEditorialCover(ctx);
    case 'engraved':
      return renderEngravedCover(ctx);
    case 'poster':
    case 'masthead':
    case 'fieldindex':
      // Phase 1 stubs still falling through to centered until Phases 3/4 add
      // their dedicated renderers. Their tokens remain monogram clones so the
      // output looks intentional rather than accidental.
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

// ─── Editorial (Magazine) ────────────────────────────────────────────────────
//
// Cormorant Garamond display title above a tagline (date · venue) and an
// At-a-Glance panel filling the lower portion of the page in lieu of a hero
// image (image upload deferred — panel always renders).
function renderEditorialCover({ t, data, dateRange, club, venue, org }: CoverContext) {
  const welcome = pickWelcome(data);
  const tagline = welcome ? trimWelcome(welcome) : composeTagline(dateRange, venue);

  return (
    <Page size="LETTER" style={{ backgroundColor: t.surfaceColor, padding: 0 }}>
      <View style={{ flex: 1, paddingHorizontal: 64, paddingTop: 80, paddingBottom: 56 }}>
        <Text
          style={{
            fontFamily: t.bodyFont,
            fontSize: 8,
            color: t.secondaryColor,
            textTransform: 'uppercase',
            letterSpacing: 4,
            textAlign: 'center',
            marginBottom: 8,
          }}
        >
          {org} · Premium List
        </Text>
        <Text
          style={{
            fontFamily: t.bodyFont,
            fontSize: 10,
            color: t.accentColor,
            textTransform: 'uppercase',
            letterSpacing: 2,
            textAlign: 'center',
            marginBottom: 32,
          }}
        >
          {club}
        </Text>
        <Text
          style={{
            fontFamily: t.displayFont,
            fontSize: 48,
            color: t.accentColor,
            textAlign: 'center',
            lineHeight: 1.05,
            marginBottom: 18,
          }}
        >
          {data.show.name}
        </Text>
        <Text
          style={{
            fontFamily: t.displayFont,
            fontStyle: 'italic',
            fontSize: 13,
            color: t.secondaryColor,
            textAlign: 'center',
            lineHeight: 1.4,
          }}
        >
          {tagline}
        </Text>
        <AtAGlancePanel data={data} tokens={t} />
      </View>
    </Page>
  );
}

// ─── Engraved (Heritage) ─────────────────────────────────────────────────────
//
// Ivory page with a double-line border frame inset from each edge, ornamental
// rules above and below the show name, an EB Garamond display title, and a
// Roman-numeral folio centered at the foot.
function renderEngravedCover({ t, data, dateRange, club, venue }: CoverContext) {
  const welcome = pickWelcome(data);
  const inset = 36;
  const innerInset = 8;

  return (
    <Page size="LETTER" style={{ backgroundColor: t.surfaceColor, padding: 0 }}>
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
            color: t.tertiaryColor ?? t.accentColor,
            textTransform: 'uppercase',
            letterSpacing: 5,
            marginBottom: 24,
          }}
        >
          Premium List
        </Text>
        <OrnamentalRule tokens={t} />
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
        <OrnamentalRule tokens={t} />
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
      {/* Roman-numeral folio */}
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
        I
      </Text>
    </Page>
  );
}

function OrnamentalRule({ tokens }: { tokens: StyleTokens }) {
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
          color: tokens.tertiaryColor ?? tokens.accentColor,
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
function pickWelcome(data: GeneratedPremium): string | null {
  const candidate = (data as { welcomeFromChair?: unknown }).welcomeFromChair;
  if (typeof candidate !== 'string') return null;
  const trimmed = candidate.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function composeTagline(dateRange: string, venue: string): string {
  return venue ? `${dateRange} · ${venue}` : dateRange;
}

function trimWelcome(welcome: string): string {
  const limit = 120;
  if (welcome.length <= limit) return welcome;
  const slice = welcome.slice(0, limit);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace > 60 ? slice.slice(0, lastSpace) : slice;
  return `${cut.trimEnd()}…`;
}

function firstSentence(welcome: string): string {
  const match = welcome.match(/^[^.!?]*[.!?]/);
  return (match ? match[0] : welcome).trim();
}
