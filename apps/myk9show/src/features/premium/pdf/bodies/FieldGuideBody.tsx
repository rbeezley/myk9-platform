// Numbered §00–§07 sections, each rendering its data as dense rows. Sections
// hide entirely when their data is empty. No multi-column at the body level —
// long sections flow vertically and react-pdf paginates.
import { Page, Text, View } from '@react-pdf/renderer';
import type { GeneratedPremium } from '../../../../types/premium-types';
import { formatDate, formatPhone, type StyleTokens } from '../pdfStyles';

interface Props {
  data: GeneratedPremium;
  tokens: StyleTokens;
  // org reserved for future org-specific divergence.
  org: 'AKC' | 'UKC';
}

export function FieldGuideBody({ data, tokens, org: _org }: Props) {
  const { show, secretary, officials, trials, supplemental, narratives } = data;

  const rowStyle = {
    flexDirection: 'row' as const,
    paddingVertical: 2,
  };
  const labelStyle = {
    fontFamily: 'IBM Plex Mono',
    fontSize: 8,
    color: tokens.secondaryColor,
    width: 90,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
  };
  const valueStyle = {
    fontFamily: tokens.bodyFont,
    fontSize: 9,
    color: tokens.textColor,
    flex: 1,
    lineHeight: 1.4,
  };
  const blockStyle = { marginBottom: 14 };

  const hasOverview = Boolean(narratives?.trialInformation?.trim());
  const hasOfficials = Boolean(officials.chairman || officials.steward || secretary.name);
  const hasJudges = trials.some(t => t.judges.length > 0);
  const hasClasses = trials.length > 0;
  const hasEntry = Boolean(
    show.entryOpenDate || show.entryCloseDate || show.preEntryFee || show.dayOfFee
  );
  const hasSchedule = Boolean(narratives?.showHours?.trim());
  const hasLocation = Boolean(
    show.venue || supplemental.accommodations.length || supplemental.vetClinic
  );
  const hasNotices = Boolean(
    supplemental.additionalNotes || supplemental.hospitalityNotes || supplemental.awardsDescription
  );

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
          fontFamily: 'IBM Plex Mono',
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
      {hasOverview && (
        <View style={blockStyle}>
          {renderHeader('§00', 'Overview')}
          <Text style={valueStyle}>{narratives.trialInformation}</Text>
        </View>
      )}

      {hasOfficials && (
        <View style={blockStyle}>
          {renderHeader('§01', 'Officials')}
          {officials.chairman && (
            <View style={rowStyle}>
              <Text style={labelStyle}>Chair</Text>
              <Text style={valueStyle}>{officials.chairman}</Text>
            </View>
          )}
          {officials.steward && (
            <View style={rowStyle}>
              <Text style={labelStyle}>Steward</Text>
              <Text style={valueStyle}>{officials.steward}</Text>
            </View>
          )}
          {secretary.name && (
            <View style={rowStyle}>
              <Text style={labelStyle}>Secretary</Text>
              <Text style={valueStyle}>
                {secretary.name}
                {secretary.email ? ` · ${secretary.email}` : ''}
                {secretary.phone ? ` · ${formatPhone(secretary.phone)}` : ''}
              </Text>
            </View>
          )}
        </View>
      )}

      {hasJudges && (
        <View style={blockStyle}>
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
        <View style={blockStyle}>
          {renderHeader('§03', 'Classes')}
          {trials.map((trial, i) => (
            <View key={i} style={{ marginBottom: 6 }}>
              <Text style={{ ...valueStyle, fontWeight: 700, marginBottom: 2 }}>
                {trial.name} — {formatDate(trial.date)}
              </Text>
              {trial.classes.length > 0 && (
                <Text style={valueStyle}>
                  {trial.classes
                    .map(c => `${c.element} ${c.level}${c.section ? ` ${c.section}` : ''}`)
                    .join(' · ')}
                </Text>
              )}
            </View>
          ))}
        </View>
      )}

      {hasEntry && (
        <View style={blockStyle}>
          {renderHeader('§04', 'Entry')}
          {show.entryOpenDate && (
            <View style={rowStyle}>
              <Text style={labelStyle}>Opens</Text>
              <Text style={valueStyle}>{formatDate(show.entryOpenDate)}</Text>
            </View>
          )}
          {show.entryCloseDate && (
            <View style={rowStyle}>
              <Text style={labelStyle}>Closes</Text>
              <Text style={valueStyle}>{formatDate(show.entryCloseDate)}</Text>
            </View>
          )}
          {(show.preEntryFee || show.dayOfFee) && (
            <View style={rowStyle}>
              <Text style={labelStyle}>Fees</Text>
              <Text style={valueStyle}>
                Pre-entry ${show.preEntryFee ?? '—'} · Day-of ${show.dayOfFee ?? '—'}
              </Text>
            </View>
          )}
        </View>
      )}

      {hasSchedule && (
        <View style={blockStyle}>
          {renderHeader('§05', 'Schedule')}
          <Text style={valueStyle}>{narratives.showHours}</Text>
        </View>
      )}

      {hasLocation && (
        <View style={blockStyle}>
          {renderHeader('§06', 'Location')}
          {show.venue && (
            <View style={rowStyle}>
              <Text style={labelStyle}>Venue</Text>
              <Text style={valueStyle}>{show.venue}</Text>
            </View>
          )}
          {supplemental.vetClinic && (
            <View style={rowStyle}>
              <Text style={labelStyle}>Vet</Text>
              <Text style={valueStyle}>
                {supplemental.vetClinic.name} · {supplemental.vetClinic.address}
                {supplemental.vetClinic.phone
                  ? ` · ${formatPhone(supplemental.vetClinic.phone)}`
                  : ''}
              </Text>
            </View>
          )}
          {supplemental.accommodations.map((a, i) => (
            <View key={i} style={rowStyle}>
              <Text style={labelStyle}>Lodging</Text>
              <Text style={valueStyle}>
                {a.name} · {a.address}
                {a.phone ? ` · ${formatPhone(a.phone)}` : ''}
              </Text>
            </View>
          ))}
        </View>
      )}

      {hasNotices && (
        <View style={blockStyle}>
          {renderHeader('§07', 'Notices')}
          {supplemental.additionalNotes && (
            <Text style={{ ...valueStyle, marginBottom: 4 }}>{supplemental.additionalNotes}</Text>
          )}
          {supplemental.hospitalityNotes && (
            <Text style={{ ...valueStyle, marginBottom: 4 }}>{supplemental.hospitalityNotes}</Text>
          )}
          {supplemental.awardsDescription && (
            <Text style={valueStyle}>{supplemental.awardsDescription}</Text>
          )}
        </View>
      )}
    </Page>
  );
}
