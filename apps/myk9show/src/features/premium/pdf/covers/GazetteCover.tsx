import { Page, Text, View } from '@react-pdf/renderer';
import type { CoverContext } from './coverContext';
import { formatDate } from '../pdfStyles';

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

  // Flatten judges across all trials, dedup by name, take up to 4.
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
          fontSize: 36,
          fontWeight: 700,
          textTransform: 'uppercase',
          textAlign: 'center',
          color: t.textColor,
          letterSpacing: 1,
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
          letterSpacing: 2,
          textAlign: 'center',
          color: t.secondaryColor,
          marginBottom: 4,
        }}
      >
        VOL. I {middot()} {formatDate(data.show.startDate)}
        {cityState ? ` ${middot()} ${cityState}` : ''}
        {akcLicenseNumber ? ` ${middot()} LICENSE NO. ${akcLicenseNumber}` : ''}
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
          height: 180,
          marginVertical: 24,
          backgroundColor: t.surfaceColor,
        }}
      />
      <Text
        style={{
          fontSize: 8,
          fontStyle: 'italic',
          color: t.secondaryColor,
          marginTop: -16,
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
              letterSpacing: 2,
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

function middot() {
  return '·';
}

function extractCityState(venue: string): string {
  if (!venue) return '';
  // Heuristic: pull the segment before the ZIP. Address shape we see is
  // "<street>, <city>, <state> <zip>"; we want "<city>, <state>".
  const parts = venue
    .split(',')
    .map(p => p.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1] ?? '';
    const stateOnly = last.replace(/\d{4,}/g, '').trim();
    const city = parts[parts.length - 2] ?? '';
    return [city, stateOnly].filter(Boolean).join(', ');
  }
  return parts[0] ?? '';
}

function composeFallbackArticle(
  club: string,
  showName: string,
  venue: string,
  dateRange: string
): string {
  const who = club || 'The host club';
  const what = showName ? `the ${showName}` : 'an upcoming scent work trial';
  const where = venue ? ` at ${venue}` : '';
  return `${who} is pleased to announce ${what}${where}, running ${dateRange}. Exhibitors will find the schedule, judges, and entry details on the inside pages.`;
}

function buildJudgeStrip(trials: CoverContext['data']['trials']): string[] {
  const seen = new Set<string>();
  const entries: string[] = [];
  for (const trial of trials) {
    for (const j of trial.judges) {
      if (!j.name || seen.has(j.name)) continue;
      seen.add(j.name);
      const elements = j.elements.length > 0 ? ` ${middot()} ${j.elements[0]}` : '';
      entries.push(`${j.name}${elements}`);
    }
  }
  if (entries.length <= 4) return entries;
  return [...entries.slice(0, 3), `${middot()} and others`];
}
