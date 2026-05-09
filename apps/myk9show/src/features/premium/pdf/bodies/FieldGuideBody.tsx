// Numbered §00–§07 sections, each rendering its data as dense rows. Sections
// hide entirely when their data is empty. No multi-column at the body level —
// long sections flow vertically and react-pdf paginates.
import { Page, Text, View } from '@react-pdf/renderer';
import type { GeneratedPremium } from '../../../../types/premium-types';
import { formatDate, formatPhone, type StyleTokens } from '../pdfStyles';
import { PdfFooter } from '../PdfFooter';
import { compareClassesByProgression } from './classOrder';

interface Props {
  data: GeneratedPremium;
  tokens: StyleTokens;
}

export function FieldGuideBody({ data, tokens }: Props) {
  const { show, secretary, officials, trials, supplemental, narratives } = data;
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

  const hasOverview = Boolean(narratives?.trialInformation?.trim());
  const hasOfficials = Boolean(officials.chairman || officials.steward || secretary.name);
  const hasJudges = trials.some(t => (t.judges?.length ?? 0) > 0);
  const hasClasses = trials.length > 0;
  const hasEntry = Boolean(
    show.entryOpenDate || show.entryCloseDate || show.preEntryFee || show.dayOfFee
  );
  const hasSchedule = Boolean(narratives?.showHours?.trim());
  const hasLocation = Boolean(
    show.venue || (supplemental.accommodations?.length ?? 0) > 0 || supplemental.vetClinic
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
          <Text style={bodyStyle}>{narratives.trialInformation}</Text>
        </View>
      )}

      {hasOfficials && (
        <View style={blockStyle} wrap={false}>
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
        <View style={blockStyle} wrap={false}>
          {renderHeader('§02', 'Judges')}
          {trials.flatMap((trial, ti) =>
            (trial.judges ?? []).map((j, ji) => (
              <View key={`${ti}-${ji}`} style={rowStyle}>
                <Text style={labelStyle}>{trial.name}</Text>
                <Text style={valueStyle}>
                  {j.name}
                  {(j.elements?.length ?? 0) > 0 ? ` · ${j.elements.join(', ')}` : ''}
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
                {trial.name} — {formatDate(trial.date)}
              </Text>
              {(trial.classes?.length ?? 0) > 0 && (
                <Text style={bodyStyle}>
                  {[...(trial.classes ?? [])]
                    .sort(compareClassesByProgression)
                    .map(c => `${c.element} ${c.level}${c.section ? ` ${c.section}` : ''}`)
                    .join(' · ')}
                </Text>
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

      {/* source: narratives.showHours — closest existing field; spec accepted this proxy in Phase 4 review. */}
      {hasSchedule && (
        <View style={blockStyle} wrap={false}>
          {renderHeader('§05', 'Schedule')}
          <Text style={bodyStyle}>{narratives.showHours}</Text>
        </View>
      )}

      {hasLocation && (
        <View style={blockStyle} wrap={false}>
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
          {(supplemental.accommodations ?? []).map((a, i) => (
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
        <View style={blockStyle} wrap={false}>
          {renderHeader('§07', 'Notices')}
          {supplemental.additionalNotes && (
            <Text style={{ ...bodyStyle, marginBottom: 4 }}>{supplemental.additionalNotes}</Text>
          )}
          {supplemental.hospitalityNotes && (
            <Text style={{ ...bodyStyle, marginBottom: 4 }}>{supplemental.hospitalityNotes}</Text>
          )}
          {supplemental.awardsDescription && (
            <Text style={bodyStyle}>{supplemental.awardsDescription}</Text>
          )}
        </View>
      )}
    </Page>
  );
}
