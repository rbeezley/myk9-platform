// 3-column classifieds layout. Outer container uses flexDirection: 'row',
// flexWrap: 'wrap', gap: 16 — let @react-pdf flow blocks naturally; we don't
// hand-balance column heights because the data shape (3–5 short sections + 1
// long judges section) makes column-equalization brittle. Tall sections spill
// naturally to the next column. Sections use wrap={false} so individual
// classifieds don't split mid-row.
import { Page, Text, View } from '@react-pdf/renderer';
import type { GeneratedPremium } from '../../../../types/premium-types';
import { formatDate, formatPhone, type StyleTokens } from '../pdfStyles';

interface Props {
  data: GeneratedPremium;
  tokens: StyleTokens;
}

export function GazetteBody({ data, tokens }: Props) {
  const { show, secretary, officials, trials, supplemental } = data;

  const sectionStyle = {
    flexBasis: '32%' as const,
    marginBottom: 16,
  };
  const headerWrapStyle = {
    borderBottomWidth: 1,
    borderBottomColor: tokens.accentColor,
    marginBottom: 6,
    paddingBottom: 4,
  };
  const headerTextStyle = {
    fontFamily: tokens.displayFont,
    fontSize: 11,
    fontWeight: 700 as const,
    color: tokens.accentColor,
    textTransform: 'uppercase' as const,
    letterSpacing: 1.5,
  };
  const bodyTextStyle = {
    fontFamily: tokens.bodyFont,
    fontSize: tokens.bodyFontSize,
    color: tokens.textColor,
    lineHeight: 1.4,
    marginBottom: 4,
  };
  const denseStyle = { ...bodyTextStyle, fontSize: tokens.bodyFontSize - 1 };

  const hasOfficials = Boolean(officials.chairman || officials.steward);
  const hasJudges = trials.some(t => t.judges.length > 0);
  const hasClasses = trials.some(t => t.classes.length > 0);
  const hasFees = (show.preEntryFee ?? 0) > 0 || (show.dayOfFee ?? 0) > 0;
  const hasEntry = Boolean(
    show.entryOpenDate || show.entryCloseDate || secretary.email || secretary.mailingAddress
  );
  const hasLodging = supplemental.accommodations.length > 0;
  const hasAwards = Boolean(supplemental.awardsDescription);
  const hasNotices = Boolean(supplemental.additionalNotes || supplemental.hospitalityNotes);

  return (
    <Page
      size="LETTER"
      style={{
        backgroundColor: tokens.surfaceColor,
        padding: tokens.pagePadding,
        fontFamily: tokens.bodyFont,
        color: tokens.textColor,
        fontSize: tokens.bodyFontSize,
      }}
    >
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
        {hasOfficials && (
          <View style={sectionStyle} wrap={false}>
            <View style={headerWrapStyle}>
              <Text style={headerTextStyle}>Officials</Text>
            </View>
            {officials.chairman && <Text style={bodyTextStyle}>Chair: {officials.chairman}</Text>}
            {officials.steward && <Text style={bodyTextStyle}>Steward: {officials.steward}</Text>}
            {secretary.name && <Text style={bodyTextStyle}>Secretary: {secretary.name}</Text>}
          </View>
        )}

        {hasJudges && (
          <View style={sectionStyle} wrap={false}>
            <View style={headerWrapStyle}>
              <Text style={headerTextStyle}>Judges</Text>
            </View>
            {trials.flatMap((trial, ti) =>
              trial.judges.map((j, ji) => (
                <Text key={`${ti}-${ji}`} style={denseStyle}>
                  {j.name}
                  {j.elements.length > 0 ? ` — ${j.elements.join(', ')}` : ''}
                </Text>
              ))
            )}
          </View>
        )}

        {hasClasses && (
          <View style={sectionStyle} wrap={false}>
            <View style={headerWrapStyle}>
              <Text style={headerTextStyle}>Classes</Text>
            </View>
            {trials.map((trial, i) => (
              <View key={i} style={{ marginBottom: 4 }}>
                <Text
                  style={{
                    ...denseStyle,
                    fontFamily: tokens.displayFont,
                    color: tokens.secondaryColor,
                  }}
                >
                  {trial.name}
                </Text>
                {trial.classes.length > 0 && (
                  <Text style={denseStyle}>
                    {trial.classes
                      .map(c => `${c.element} ${c.level}${c.section ? ` ${c.section}` : ''}`)
                      .join(' · ')}
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}

        {hasFees && (
          <View style={sectionStyle} wrap={false}>
            <View style={headerWrapStyle}>
              <Text style={headerTextStyle}>Fees</Text>
            </View>
            <Text style={bodyTextStyle}>Pre-entry: ${show.preEntryFee ?? '—'}</Text>
            <Text style={bodyTextStyle}>Day-of: ${show.dayOfFee ?? '—'}</Text>
            <Text style={bodyTextStyle}>
              {[show.acceptChecks && 'Checks', show.acceptCash && 'Cash']
                .filter(Boolean)
                .join(' · ') || 'Payment TBD'}
            </Text>
          </View>
        )}

        {hasEntry && (
          <View style={sectionStyle} wrap={false}>
            <View style={headerWrapStyle}>
              <Text style={headerTextStyle}>Entry Methods</Text>
            </View>
            {show.entryOpenDate && (
              <Text style={bodyTextStyle}>Opens: {formatDate(show.entryOpenDate)}</Text>
            )}
            {show.entryCloseDate && (
              <Text style={bodyTextStyle}>Closes: {formatDate(show.entryCloseDate)}</Text>
            )}
            {secretary.email && <Text style={bodyTextStyle}>Email: {secretary.email}</Text>}
            {secretary.mailingAddress && (
              <Text style={bodyTextStyle}>Mail: {secretary.mailingAddress}</Text>
            )}
            {secretary.phone && (
              <Text style={bodyTextStyle}>Phone: {formatPhone(secretary.phone)}</Text>
            )}
          </View>
        )}

        {hasLodging && (
          <View style={sectionStyle} wrap={false}>
            <View style={headerWrapStyle}>
              <Text style={headerTextStyle}>Lodging</Text>
            </View>
            {supplemental.accommodations.map((a, i) => (
              <View key={i} style={{ marginBottom: 4 }}>
                <Text style={{ ...denseStyle, fontWeight: 700 }}>{a.name}</Text>
                <Text style={denseStyle}>{a.address}</Text>
                {a.phone && <Text style={denseStyle}>{formatPhone(a.phone)}</Text>}
              </View>
            ))}
          </View>
        )}

        {hasAwards && (
          <View style={sectionStyle} wrap={false}>
            <View style={headerWrapStyle}>
              <Text style={headerTextStyle}>Awards</Text>
            </View>
            <Text style={bodyTextStyle}>{supplemental.awardsDescription}</Text>
          </View>
        )}

        {hasNotices && (
          <View style={sectionStyle} wrap={false}>
            <View style={headerWrapStyle}>
              <Text style={headerTextStyle}>Notices</Text>
            </View>
            {supplemental.additionalNotes && (
              <Text style={bodyTextStyle}>{supplemental.additionalNotes}</Text>
            )}
            {supplemental.hospitalityNotes && (
              <Text style={bodyTextStyle}>{supplemental.hospitalityNotes}</Text>
            )}
          </View>
        )}
      </View>
    </Page>
  );
}
