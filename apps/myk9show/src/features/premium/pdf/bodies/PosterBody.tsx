import { Page, Text, View } from '@react-pdf/renderer';
import type { GeneratedPremium } from '../../../../types/premium-types';
import type { StyleTokens } from '../pdfStyles';
import { PdfFooter } from '../PdfFooter';
import { buildPremiumFacts, REQUIRED_PLACEHOLDER as REQUIRED } from '../../premiumFacts';

interface Props {
  data: GeneratedPremium;
  tokens: StyleTokens;
}

/**
 * Poster body — inner pages that follow the single-page hero cover. Keeps the
 * Archivo Black eyebrow labels for visual continuity with the cover but
 * switches to readable Inter body copy. The first inner page uses
 * `<View break>` to force a clean page break at the typography shift so
 * @react-pdf doesn't try to interleave the hero with body sections.
 */
export function PosterBody({ data, tokens }: Props) {
  const f = buildPremiumFacts(data);
  const { secretary, chair, trials } = f;
  const labelStyle = {
    fontFamily: tokens.displayFont,
    fontSize: 11,
    color: tokens.accentColor,
    textTransform: 'uppercase' as const,
    letterSpacing: 1.5,
    marginBottom: 6,
  };
  const eyebrowStyle = {
    fontFamily: 'IBM Plex Mono',
    fontSize: 8,
    color: tokens.secondaryColor,
    textTransform: 'uppercase' as const,
    letterSpacing: 2,
  };
  const bodyStyle = {
    fontFamily: tokens.bodyFont,
    fontSize: tokens.bodyFontSize,
    color: tokens.textColor,
    lineHeight: 1.5,
    marginBottom: 18,
  };
  const sectionGap = { marginBottom: 22 };

  const hasOfficials = Boolean(chair);
  const hasAccommodations = f.accommodations.length > 0;

  return (
    <Page
      size="LETTER"
      style={{
        backgroundColor: tokens.surfaceColor,
        padding: tokens.pagePadding,
        fontFamily: tokens.bodyFont,
        fontSize: tokens.bodyFontSize,
        color: tokens.textColor,
      }}
    >
      <PdfFooter style={data.style} color={tokens.secondaryColor} />
      {/* Page-shift hint: ensure inner pages start on a fresh sheet, not
          interleaved with the cover hero composition. */}
      <View
        break
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          marginBottom: 28,
        }}
      >
        <Text style={eyebrowStyle}>{f.clubName}</Text>
        <Text style={eyebrowStyle}>The Trial</Text>
      </View>

      <View style={sectionGap}>
        <Text style={labelStyle}>Entry</Text>
        {/* INTENT: Online via myK9Show is the primary entry method — bolded
            here so exhibitors don't default to mail-in (which is slower and
            doesn't generate platform revenue). */}
        <Text style={{ ...bodyStyle, fontWeight: 700, marginBottom: 6 }}>
          Online entries via myK9Show
        </Text>
        <Text style={bodyStyle}>
          Pre-entry ${f.fees.preEntry ?? '—'} · Day-of ${f.fees.dayOf ?? '—'} ·{' '}
          {f.fees.paymentMethods.join(', ') || 'Payment methods TBD'}.{'\n'}
          Opens {f.entry.opens ?? REQUIRED} · Closes {f.entry.closes ?? REQUIRED}.
        </Text>
      </View>

      <View style={sectionGap}>
        <Text style={labelStyle}>Trial Secretary</Text>
        <Text style={bodyStyle}>
          {secretary.name ?? REQUIRED}
          {secretary.email ? `\n${secretary.email}` : ''}
          {secretary.phone ? ` · ${secretary.phone}` : ''}
          {secretary.mailingAddress ? `\n${secretary.mailingAddress}` : ''}
        </Text>
      </View>

      {hasOfficials && (
        <View style={sectionGap}>
          <Text style={labelStyle}>Officials</Text>
          <Text style={bodyStyle}>
            {chair ? `Chair: ${chair.name}` : ''}
            {chair?.email ? ` · ${chair.email}` : ''}
            {chair?.phone ? ` · ${chair.phone}` : ''}
          </Text>
        </View>
      )}

      <View style={sectionGap}>
        <Text style={labelStyle}>Trials &amp; Judges</Text>
        {trials.map((trial, i) => (
          <View key={i} style={{ marginBottom: 12 }}>
            <Text
              style={{
                fontFamily: tokens.displayFont,
                fontSize: 13,
                color: tokens.secondaryColor,
                marginBottom: 2,
              }}
            >
              {trial.name}
            </Text>
            <Text style={{ ...bodyStyle, marginBottom: 4 }}>
              {trial.date}
              {trial.startTime ? ` at ${trial.startTime}` : ''}
              {trial.eventNumber ? ` · Event ${trial.eventNumber}` : ''}
            </Text>
            {trial.judges.length > 0 && (
              <Text style={{ ...bodyStyle, marginBottom: 4 }}>
                Judged by{' '}
                {trial.judges
                  .map(j => `${j.name}${j.elements.length ? ` (${j.elements.join(', ')})` : ''}`)
                  .join(' & ')}
              </Text>
            )}
            {trial.classLabels.length > 0 && (
              <Text style={bodyStyle}>{trial.classLabels.join(' · ')}</Text>
            )}
          </View>
        ))}
      </View>

      <View style={sectionGap}>
        <Text style={labelStyle}>Show Hours</Text>
        <Text style={bodyStyle}>{f.showHours}</Text>
      </View>

      <View style={sectionGap}>
        <Text style={labelStyle}>About the Trial</Text>
        <Text style={bodyStyle}>{f.trialInformation}</Text>
      </View>

      <View style={sectionGap}>
        <Text style={labelStyle}>On-Call Vet</Text>
        {f.vetClinic ? (
          <Text style={bodyStyle}>
            {f.vetClinic.name}
            {'\n'}
            {f.vetClinic.address}
            {'\n'}
            {f.vetClinic.phone}
          </Text>
        ) : (
          <Text style={{ ...bodyStyle, color: '#cc0000' }}>{REQUIRED}</Text>
        )}
      </View>

      {hasAccommodations && (
        <View style={sectionGap}>
          <Text style={labelStyle}>Accommodations</Text>
          {f.accommodations.map((a, i) => (
            <Text key={i} style={bodyStyle}>
              {a.name} — {a.address} · {a.phone}
            </Text>
          ))}
        </View>
      )}

      {f.hospitalityNotes && (
        <View style={sectionGap}>
          <Text style={labelStyle}>Hospitality</Text>
          <Text style={bodyStyle}>{f.hospitalityNotes}</Text>
        </View>
      )}

      {f.awardsDescription && (
        <View style={sectionGap}>
          <Text style={labelStyle}>Awards</Text>
          <Text style={bodyStyle}>{f.awardsDescription}</Text>
        </View>
      )}

      {f.additionalNotes && (
        <View style={sectionGap}>
          <Text style={labelStyle}>Notes</Text>
          <Text style={bodyStyle}>{f.additionalNotes}</Text>
        </View>
      )}

      {/* Closing call-out — kept intact across page breaks. */}
      <View
        wrap={false}
        style={{
          marginTop: 12,
          padding: 16,
          backgroundColor: tokens.secondaryColor,
        }}
      >
        <Text
          style={{
            fontFamily: 'IBM Plex Mono',
            fontSize: 8,
            color: tokens.surfaceColor,
            textTransform: 'uppercase',
            letterSpacing: 2,
            marginBottom: 4,
          }}
        >
          Entries Close
        </Text>
        <Text
          style={{
            fontFamily: tokens.displayFont,
            fontSize: 22,
            color: tokens.surfaceColor,
            lineHeight: 1.05,
          }}
        >
          {f.entry.closes ?? 'TBD'}
        </Text>
      </View>
    </Page>
  );
}
