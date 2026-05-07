import { Page, Text, View } from '@react-pdf/renderer';
import type { CoverContext } from './coverContext';
import { formatDate } from '../pdfStyles';
import {
  MIDDOT,
  buildJudgeStrip,
  composeFallbackArticle,
  extractCityState,
} from './gazetteHelpers';

// ─── Layout constants ────────────────────────────────────────────────────────
// Hoisted from inline literals so a designer can tune the masthead in one
// place without grepping for magic numbers.

const MASTHEAD_FONT_SIZE = 36;
const LETTER_SPACE_TIGHT = 1;
const LETTER_SPACE_WIDE = 2;
const PHOTO_PLACEHOLDER_HEIGHT = 180;
// Pulls the caption up against the placeholder's bottom border without an extra wrapper.
const PHOTO_CAPTION_OFFSET = -16;

/**
 * Gazette cover — newspaper masthead. Large Playfair club name, thin rule,
 * small-caps meta row, feature article headline + body, sepia-bordered photo
 * placeholder, and a judges strip across the bottom.
 *
 * Org-conditional: AKC mastheads append a "License No." segment when the
 * underlying premium carries an event number on the first trial; UKC omits it.
 */
export function renderGazetteCover(ctx: CoverContext) {
  const { t, data, dateRange, club, venue, org } = ctx;

  // The data shape doesn't carry a dedicated AKC license field. The first
  // trial's eventNumber is the closest analogue (e.g., "AKC-2026-001"); show
  // it on AKC mastheads only so the gazette label has parity with sanction
  // expectations without inventing a new field.
  const akcLicenseNumber = org === 'AKC' ? (data.trials[0]?.eventNumber ?? null) : null;

  // Pull a city/state-ish fragment from the venue address. Newspaper
  // mastheads want a place tag, not a full street address.
  const cityState = extractCityState(venue);

  const headline =
    club && data.show.name ? `${club} to Hold ${data.show.name}` : 'Premium Information';

  const welcome =
    data.narratives &&
    typeof (data.narratives as Record<string, unknown>).welcomeFromChair === 'string'
      ? ((data.narratives as Record<string, string>).welcomeFromChair ?? '')
      : '';
  const article =
    welcome && welcome.trim().length >= 20
      ? welcome
      : composeFallbackArticle(club, data.show.name, venue, dateRange);

  // Flatten judges across all trials, dedup by name, take up to JUDGES_STRIP_MAX.
  const judgeStrip = buildJudgeStrip(data.trials);

  return (
    <Page
      size="LETTER"
      style={{
        backgroundColor: t.surfaceColor,
        padding: t.pagePadding,
        color: t.textColor,
        fontFamily: t.bodyFont,
        fontSize: t.bodyFontSize,
      }}
    >
      {/* Masthead */}
      <Text
        style={{
          fontFamily: t.displayFont,
          fontSize: MASTHEAD_FONT_SIZE,
          fontWeight: 700,
          textTransform: 'uppercase',
          textAlign: 'center',
          color: t.textColor,
          letterSpacing: LETTER_SPACE_TIGHT,
        }}
      >
        {club || 'Premium Gazette'}
      </Text>
      <View
        style={{
          borderBottomWidth: 1,
          borderBottomColor: t.secondaryColor,
          marginVertical: 8,
        }}
      />
      <Text
        style={{
          fontFamily: t.bodyFont,
          fontSize: 8,
          textTransform: 'uppercase',
          letterSpacing: LETTER_SPACE_WIDE,
          textAlign: 'center',
          color: t.secondaryColor,
          marginBottom: 4,
        }}
      >
        VOL. I {MIDDOT} {formatDate(data.show.startDate)}
        {cityState ? ` ${MIDDOT} ${cityState}` : ''}
        {akcLicenseNumber ? ` ${MIDDOT} LICENSE NO. ${akcLicenseNumber}` : ''}
      </Text>
      <View
        style={{
          borderBottomWidth: 1,
          borderBottomColor: t.secondaryColor,
          marginVertical: 8,
        }}
      />

      {/* Feature article */}
      <Text
        style={{
          fontFamily: t.displayFont,
          fontSize: 22,
          color: t.textColor,
          marginTop: 16,
          marginBottom: 6,
          lineHeight: 1.2,
        }}
      >
        {headline}
      </Text>
      <Text
        style={{
          fontFamily: t.displayFont,
          fontStyle: 'italic',
          fontSize: 11,
          color: t.secondaryColor,
          marginBottom: 12,
        }}
      >
        {dateRange}
      </Text>
      <Text
        style={{
          fontFamily: t.bodyFont,
          fontSize: t.bodyFontSize,
          color: t.textColor,
          lineHeight: 1.5,
        }}
      >
        {article}
      </Text>

      {/* Photo placeholder */}
      <View
        style={{
          borderWidth: 1,
          borderColor: t.accentColor,
          borderStyle: 'solid',
          height: PHOTO_PLACEHOLDER_HEIGHT,
          marginVertical: 24,
          backgroundColor: t.surfaceColor,
        }}
      />
      <Text
        style={{
          fontSize: 8,
          fontStyle: 'italic',
          color: t.secondaryColor,
          marginTop: PHOTO_CAPTION_OFFSET,
          marginBottom: 16,
        }}
      >
        Photo by club secretary
      </Text>

      {/* Judges strip */}
      {judgeStrip.length > 0 && (
        <>
          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: t.secondaryColor,
              marginTop: 8,
              paddingTop: 8,
            }}
          />
          <Text
            style={{
              fontFamily: t.bodyFont,
              fontSize: 7,
              textTransform: 'uppercase',
              letterSpacing: LETTER_SPACE_WIDE,
              color: t.secondaryColor,
              marginBottom: 4,
            }}
          >
            Judging Panel
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {judgeStrip.map((entry, i) => (
              <Text
                key={i}
                style={{
                  fontFamily: t.bodyFont,
                  fontSize: 9,
                  color: t.textColor,
                  marginRight: 12,
                }}
              >
                {entry}
              </Text>
            ))}
          </View>
        </>
      )}
    </Page>
  );
}
