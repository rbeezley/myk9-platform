// 3-column classifieds layout. Outer container uses flexDirection: 'row',
// flexWrap: 'wrap', gap: 16 — let @react-pdf flow blocks naturally; we don't
// hand-balance column heights because the data shape (3–5 short sections + 1
// long judges section) makes column-equalization brittle. Tall sections spill
// naturally to the next column. Sections use wrap={false} so individual
// classifieds don't split mid-row.
import { judgeBlockText } from './judgeLine';
import { Page, Text, View } from '@react-pdf/renderer';
import type { GeneratedPremium } from '../../../../types/premium-types';
import type { StyleTokens } from '../pdfStyles';
import { PdfFooter } from '../PdfFooter';
import { buildPremiumFacts } from '../../premiumFacts';

interface Props {
  data: GeneratedPremium;
  tokens: StyleTokens;
}

export function GazetteBody({ data, tokens }: Props) {
  const f = buildPremiumFacts(data);
  const { secretary, chair, trials } = f;

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

  const hasSecretary = Boolean(
    secretary.name || secretary.email || secretary.phone || secretary.mailingAddress
  );
  const hasOfficials = Boolean(
    chair || hasSecretary || f.officers.length > 0 || f.committee.length > 0
  );
  const hasJudges = trials.some(t => t.judges.length > 0);
  const hasClasses = trials.some(t => t.classLabels.length > 0);
  const hasFees = f.fees.hasAny;
  // MYK9-2065: an official's contact is never an entry method; the entry section is online only.
  // MYK9-2204: every show takes online entries, so the section prints even with no dates set.
  const hasLodging = f.accommodations.length > 0;
  const hasAwards = Boolean(f.awardsDescription);
  const hasNotices = Boolean(f.additionalNotes || f.hospitalityNotes);

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
      <PdfFooter style={data.style} color={tokens.secondaryColor} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
        {hasOfficials && (
          <View style={sectionStyle} wrap={false}>
            <View style={headerWrapStyle}>
              <Text style={headerTextStyle}>Officials</Text>
            </View>
            {chair && <Text style={bodyTextStyle}>Chair: {chair.name}</Text>}
            {chair?.email && <Text style={bodyTextStyle}>Chair Email: {chair.email}</Text>}
            {chair?.phone && <Text style={bodyTextStyle}>Chair Phone: {chair.phone}</Text>}
            {chair?.mailingAddress && (
              <Text style={bodyTextStyle}>Chair Mail: {chair.mailingAddress}</Text>
            )}
            {secretary.name && <Text style={bodyTextStyle}>Secretary: {secretary.name}</Text>}
            {secretary.email && (
              <Text style={bodyTextStyle}>Secretary Email: {secretary.email}</Text>
            )}
            {secretary.phone && (
              <Text style={bodyTextStyle}>Secretary Phone: {secretary.phone}</Text>
            )}
            {secretary.mailingAddress && (
              <Text style={bodyTextStyle}>Secretary Mail: {secretary.mailingAddress}</Text>
            )}
            {f.officers.map(o => (
              <Text key={`${o.title}-${o.name}`} style={bodyTextStyle}>
                {o.title}: {o.name}
              </Text>
            ))}
            {f.committee.length > 0 && (
              <Text style={bodyTextStyle}>Event Committee: {f.committee.join(', ')}</Text>
            )}
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
                  {judgeBlockText(j)}
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
                  {trial.date ? `${trial.name} · ${trial.date}` : trial.name}
                </Text>
                {trial.classLabels.length > 0 && (
                  <Text style={denseStyle}>{trial.classLabels.join(' · ')}</Text>
                )}
                {trial.entryLimit && <Text style={denseStyle}>{trial.entryLimit}</Text>}
              </View>
            ))}
          </View>
        )}

        {hasFees && (
          <View style={sectionStyle} wrap={false}>
            <View style={headerWrapStyle}>
              <Text style={headerTextStyle}>Fees</Text>
            </View>
            <Text style={bodyTextStyle}>Pre-entry: ${f.fees.preEntry ?? '—'}</Text>
            <Text style={bodyTextStyle}>Day-of: ${f.fees.dayOf ?? '—'}</Text>
            <Text style={bodyTextStyle}>{f.fees.paymentMethods.join(' · ') || 'Payment TBD'}</Text>
          </View>
        )}

        <View style={sectionStyle} wrap={false}>
          <View style={headerWrapStyle}>
            <Text style={headerTextStyle}>Entry Methods</Text>
          </View>
          <Text style={{ ...bodyTextStyle, fontWeight: 700 }}>Online entries via myK9Show</Text>
          <Text style={bodyTextStyle}>myk9show.com</Text>
          {f.entry.opens && <Text style={bodyTextStyle}>Opens: {f.entry.opens}</Text>}
          {f.entry.closes && <Text style={bodyTextStyle}>Closes: {f.entry.closes}</Text>}
        </View>

        {hasLodging && (
          <View style={sectionStyle} wrap={false}>
            <View style={headerWrapStyle}>
              <Text style={headerTextStyle}>Lodging</Text>
            </View>
            {f.accommodations.map((a, i) => (
              <View key={i} style={{ marginBottom: 4 }}>
                <Text style={{ ...denseStyle, fontWeight: 700 }}>{a.name}</Text>
                <Text style={denseStyle}>{a.address}</Text>
                {a.phone && <Text style={denseStyle}>{a.phone}</Text>}
              </View>
            ))}
          </View>
        )}

        {f.vetClinic && (
          <View style={sectionStyle} wrap={false}>
            <View style={headerWrapStyle}>
              <Text style={headerTextStyle}>Emergency Vet</Text>
            </View>
            <Text style={{ ...denseStyle, fontWeight: 700 }}>{f.vetClinic.name}</Text>
            {f.vetClinic.address && <Text style={denseStyle}>{f.vetClinic.address}</Text>}
            {f.vetClinic.phone && <Text style={denseStyle}>{f.vetClinic.phone}</Text>}
          </View>
        )}

        {hasAwards && (
          <View style={sectionStyle} wrap={false}>
            <View style={headerWrapStyle}>
              <Text style={headerTextStyle}>Awards</Text>
            </View>
            <Text style={bodyTextStyle}>{f.awardsDescription}</Text>
          </View>
        )}
      </View>

      {f.recordingFee && (
        <View style={{ marginTop: 16 }} wrap={false}>
          <Text style={bodyTextStyle}>{f.recordingFee}</Text>
        </View>
      )}

      {/* MYK9-1976: full-width and free to break across pages, so the policy is never cut. */}
      {f.withdrawalPolicy && (
        <View style={{ marginTop: 16 }}>
          <View style={headerWrapStyle}>
            <Text style={headerTextStyle}>{f.withdrawalPolicy.label}</Text>
          </View>
          <Text style={bodyTextStyle}>{f.withdrawalPolicy.text}</Text>
        </View>
      )}

      {f.entryLimit && (
        <View style={{ marginTop: 16 }} wrap={false}>
          <Text style={bodyTextStyle}>{f.entryLimit}</Text>
        </View>
      )}

      {f.scoutingStatement && (
        <View style={{ marginTop: 16 }} wrap={false}>
          <View style={headerWrapStyle}>
            <Text style={headerTextStyle}>{f.scoutingStatement.label}</Text>
          </View>
          <Text style={bodyTextStyle}>{f.scoutingStatement.text}</Text>
        </View>
      )}

      {/* Show Hours, Trial Information, and Notices run full-width below the
          3-col grid — these are paragraph-length narratives that don't read
          well in a 32% column. */}
      {f.showHours.trim() && (
        <View style={{ marginTop: 16 }}>
          <View style={headerWrapStyle}>
            <Text style={headerTextStyle}>Show Hours</Text>
          </View>
          <Text style={bodyTextStyle}>{f.showHours}</Text>
        </View>
      )}

      {f.trialInformation.trim() && (
        <View style={{ marginTop: 16 }}>
          <View style={headerWrapStyle}>
            <Text style={headerTextStyle}>Trial Information</Text>
          </View>
          <Text style={bodyTextStyle}>{f.trialInformation}</Text>
        </View>
      )}

      {hasNotices && (
        <View style={{ marginTop: 16 }}>
          <View style={headerWrapStyle}>
            <Text style={headerTextStyle}>Notices</Text>
          </View>
          {f.additionalNotes && <Text style={bodyTextStyle}>{f.additionalNotes}</Text>}
          {f.hospitalityNotes && <Text style={bodyTextStyle}>{f.hospitalityNotes}</Text>}
        </View>
      )}
    </Page>
  );
}
