import { Page, Text, View } from '@react-pdf/renderer';
import type { CoverContext } from './coverContext';
import { formatDate } from '../pdfStyles';
import {
  MIDDOT,
  buildJudgeStrip,
  composeFallbackArticle,
  extractCityState,
} from './gazetteHelpers';
import { compareClassesByProgression, compareLevelsByProgression } from '../bodies/classOrder';

// ─── Layout constants ────────────────────────────────────────────────────────
// Hoisted from inline literals so a designer can tune the masthead in one
// place without grepping for magic numbers.

const MASTHEAD_FONT_SIZE = 36;
const LETTER_SPACE_TIGHT = 1;
const LETTER_SPACE_WIDE = 2;

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

  // "At a Glance" lines used by the cover-image fallback panel below.
  const trials = data.trials ?? [];
  const allClasses = trials
    .flatMap(tr => tr.classes ?? [])
    .slice()
    .sort(compareClassesByProgression);
  const elements = Array.from(new Set(allClasses.map(c => c.element))).filter(Boolean);
  const levels = Array.from(new Set(allClasses.map(c => c.level)))
    .filter(Boolean)
    .sort(compareLevelsByProgression);
  const atAGlanceLines: Array<{ label: string; value: string }> = [];
  if (trials.length > 0) {
    atAGlanceLines.push({
      label: 'Trials',
      value: `${trials.length} ${MIDDOT} ${formatDate(data.show.startDate)}`,
    });
  }
  if (elements.length > 0) {
    atAGlanceLines.push({ label: 'Elements', value: elements.join(` ${MIDDOT} `) });
  }
  if (levels.length > 0) {
    atAGlanceLines.push({ label: 'Levels', value: levels.join(` ${MIDDOT} `) });
  }
  atAGlanceLines.push({ label: 'Sanctioning', value: org });
  if (data.show.entryCloseDate) {
    atAGlanceLines.push({
      label: 'Entries Close',
      value: formatDate(data.show.entryCloseDate),
    });
  }

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

      {/* "At a Glance" fallback panel — replaces the empty photo box when no
          cover image is uploaded. TODO: when cover-image upload ships, render
          an <Image src={…}/> here instead of (or above) this fallback. */}
      <View
        style={{
          borderWidth: 1,
          borderColor: t.accentColor,
          borderStyle: 'solid',
          padding: 16,
          marginVertical: 24,
          backgroundColor: t.surfaceColor,
        }}
      >
        <Text
          style={{
            fontFamily: t.displayFont,
            fontSize: 9,
            color: t.accentColor,
            textTransform: 'uppercase',
            letterSpacing: LETTER_SPACE_WIDE,
            marginBottom: 8,
          }}
        >
          At a Glance
        </Text>
        {atAGlanceLines.map((line, i) => (
          <View key={i} style={{ flexDirection: 'row', marginBottom: 4 }}>
            <Text
              style={{
                width: 90,
                fontSize: 8,
                color: t.secondaryColor,
                textTransform: 'uppercase',
                letterSpacing: LETTER_SPACE_TIGHT,
              }}
            >
              {line.label}
            </Text>
            <Text style={{ flex: 1, fontSize: 10, color: t.textColor }}>{line.value}</Text>
          </View>
        ))}
      </View>

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
