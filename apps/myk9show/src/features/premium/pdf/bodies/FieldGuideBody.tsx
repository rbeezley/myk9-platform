// Numbered §00–§07 sections, each rendering its data as dense rows. Sections
// hide entirely when their data is empty. No multi-column at the body level —
// long sections flow vertically and react-pdf paginates.
import { Page, Text, View } from '@react-pdf/renderer';
import type { GeneratedPremium } from '../../../../types/premium-types';
import type { StyleTokens } from '../pdfStyles';
import { PdfFooter } from '../PdfFooter';
import { buildPremiumFacts } from '../../premiumFacts';

interface Props {
  data: GeneratedPremium;
  tokens: StyleTokens;
}

export function FieldGuideBody({ data, tokens }: Props) {
  const f = buildPremiumFacts(data);
  const { secretary, chair, trials } = f;
  const monoFont = tokens.monoFont ?? 'IBM Plex Mono';

  const rowStyle = {
    flexDirection: 'row' as const,
    paddingVertical: 2,
  };
  const labelStyle = {
    fontFamily: monoFont,
    fontSize: 8,
    color: tokens.secondaryColor,
    width: 90,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
  };
  // flex:1 is correct only inside rowStyle (flexDirection:'row') cells where it
  // takes remaining horizontal space. In column contexts (standalone paragraphs)
  // flex:1 makes @react-pdf compute height as 0, causing sections to overlap.
  const valueStyle = {
    fontFamily: tokens.bodyFont,
    fontSize: 9,
    color: tokens.textColor,
    flex: 1,
    lineHeight: 1.4,
  };
  const bodyStyle = {
    fontFamily: tokens.bodyFont,
    fontSize: 9,
    color: tokens.textColor,
    lineHeight: 1.4,
  };
  const blockStyle = { marginBottom: 14 };

  const hasOverview = Boolean(f.trialInformation.trim());
  const hasOfficials = Boolean(chair || secretary.name);
  const hasJudges = trials.some(t => t.judges.length > 0);
  const hasClasses = trials.length > 0;
  const hasEntry = Boolean(
    f.entry.opens || f.entry.closes || f.fees.preEntry || f.fees.dayOf || f.terms.length > 0
  );
  const hasSchedule = Boolean(f.showHours.trim());
  const hasLocation = Boolean(f.venue || f.accommodations.length > 0 || f.vetClinic);
  const hasNotices = Boolean(f.additionalNotes || f.hospitalityNotes || f.awardsDescription);

  const renderHeader = (num: string, title: string) => (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'baseline',
        marginBottom: 6,
        borderBottomWidth: 0.5,
        borderBottomColor: tokens.accentColor,
        paddingBottom: 3,
      }}
    >
      <Text
        style={{
          fontFamily: monoFont,
          fontSize: 11,
          color: tokens.accentColor,
          marginRight: 8,
        }}
      >
        {num}
      </Text>
      <Text
        style={{
          fontFamily: tokens.bodyFont,
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 1,
          color: tokens.textColor,
        }}
      >
        {title}
      </Text>
    </View>
  );

  return (
    <Page
      size="LETTER"
      style={{
        backgroundColor: tokens.surfaceColor,
        padding: tokens.pagePadding,
        fontFamily: tokens.bodyFont,
        fontSize: 9,
        color: tokens.textColor,
      }}
    >
      <PdfFooter style={data.style} color={tokens.secondaryColor} />
      {hasOverview && (
        <View style={blockStyle} wrap={false}>
          {renderHeader('§00', 'Overview')}
          <Text style={bodyStyle}>{f.trialInformation}</Text>
        </View>
      )}

      {hasOfficials && (
        <View style={blockStyle} wrap={false}>
          {renderHeader('§01', 'Officials')}
          {chair && (
            <View style={rowStyle}>
              <Text style={labelStyle}>Chair</Text>
              <Text style={valueStyle}>
                {chair.name}
                {chair.email ? ` · ${chair.email}` : ''}
                {chair.phone ? ` · ${chair.phone}` : ''}
              </Text>
            </View>
          )}
          {secretary.name && (
            <View style={rowStyle}>
              <Text style={labelStyle}>Secretary</Text>
              <Text style={valueStyle}>
                {secretary.name}
                {secretary.email ? ` · ${secretary.email}` : ''}
                {secretary.phone ? ` · ${secretary.phone}` : ''}
              </Text>
            </View>
          )}
        </View>
      )}

      {hasJudges && (
        <View style={blockStyle} wrap={false}>
          {renderHeader('§02', 'Judges')}
          {trials.flatMap((trial, ti) =>
            trial.judges.map((j, ji) => (
              <View key={`${ti}-${ji}`} style={rowStyle}>
                <Text style={labelStyle}>{trial.name}</Text>
                <Text style={valueStyle}>
                  {j.name}
                  {j.elements.length > 0 ? ` · ${j.elements.join(', ')}` : ''}
                </Text>
              </View>
            ))
          )}
        </View>
      )}

      {hasClasses && (
        <View style={blockStyle} wrap={false}>
          {renderHeader('§03', 'Classes')}
          {trials.map((trial, i) => (
            <View key={i} style={{ marginBottom: 6 }}>
              <Text style={{ ...bodyStyle, fontWeight: 700, marginBottom: 2 }}>
                {trial.name} — {trial.date}
              </Text>
              {trial.classLabels.length > 0 && (
                <Text style={bodyStyle}>{trial.classLabels.join(' · ')}</Text>
              )}
            </View>
          ))}
        </View>
      )}

      {hasEntry && (
        <View style={blockStyle} wrap={false}>
          {renderHeader('§04', 'Entry')}
          {/* INTENT: Online via myK9Show is the primary entry method —
              listed first and bolded so this reference layout doesn't bury
              the revenue-generating channel beneath dates and fees. */}
          <View style={rowStyle}>
            <Text style={labelStyle}>Method</Text>
            <Text style={{ ...valueStyle, fontWeight: 700 }}>Online entries via myK9Show</Text>
          </View>
          {f.entry.opens && (
            <View style={rowStyle}>
              <Text style={labelStyle}>Opens</Text>
              <Text style={valueStyle}>{f.entry.opens}</Text>
            </View>
          )}
          {f.entry.closes && (
            <View style={rowStyle}>
              <Text style={labelStyle}>Closes</Text>
              <Text style={valueStyle}>{f.entry.closes}</Text>
            </View>
          )}
          {(f.fees.preEntry || f.fees.dayOf) && (
            <View style={rowStyle}>
              <Text style={labelStyle}>Fees</Text>
              <Text style={valueStyle}>
                Pre-entry ${f.fees.preEntry ?? '—'} · Day-of ${f.fees.dayOf ?? '—'}
              </Text>
            </View>
          )}
          {f.terms.map(term => (
            <View key={term.id} style={rowStyle}>
              <Text style={labelStyle}>{term.label}</Text>
              <Text style={valueStyle}>{term.value}</Text>
            </View>
          ))}
        </View>
      )}

      {/* source: narratives.showHours — closest existing field; spec accepted this proxy in Phase 4 review. */}
      {hasSchedule && (
        <View style={blockStyle} wrap={false}>
          {renderHeader('§05', 'Schedule')}
          <Text style={bodyStyle}>{f.showHours}</Text>
        </View>
      )}

      {hasLocation && (
        <View style={blockStyle} wrap={false}>
          {renderHeader('§06', 'Location')}
          {f.venue && (
            <View style={rowStyle}>
              <Text style={labelStyle}>Venue</Text>
              <Text style={valueStyle}>{f.venue}</Text>
            </View>
          )}
          {f.vetClinic && (
            <View style={rowStyle}>
              <Text style={labelStyle}>Vet</Text>
              <Text style={valueStyle}>
                {f.vetClinic.name} · {f.vetClinic.address}
                {f.vetClinic.phone ? ` · ${f.vetClinic.phone}` : ''}
              </Text>
            </View>
          )}
          {f.accommodations.map((a, i) => (
            <View key={i} style={rowStyle}>
              <Text style={labelStyle}>Lodging</Text>
              <Text style={valueStyle}>
                {a.name} · {a.address}
                {a.phone ? ` · ${a.phone}` : ''}
              </Text>
            </View>
          ))}
        </View>
      )}

      {hasNotices && (
        <View style={blockStyle} wrap={false}>
          {renderHeader('§07', 'Notices')}
          {f.additionalNotes && (
            <Text style={{ ...bodyStyle, marginBottom: 4 }}>{f.additionalNotes}</Text>
          )}
          {f.hospitalityNotes && (
            <Text style={{ ...bodyStyle, marginBottom: 4 }}>{f.hospitalityNotes}</Text>
          )}
          {f.awardsDescription && <Text style={bodyStyle}>{f.awardsDescription}</Text>}
        </View>
      )}
    </Page>
  );
}
