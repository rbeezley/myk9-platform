// Shared body for both AKC and UKC. The 'org' prop is the seam for future org-specific divergence; today both orgs render identically.
import { Page, Text, View } from '@react-pdf/renderer';
import type { GeneratedPremium } from '../../../../types/premium-types';
import { buildStyles, formatDate, formatPhone, resolveTokens } from '../pdfStyles';
import { SectionDivider } from '../SectionDivider';

const REQUIRED = '[REQUIRED — add before submitting]';

interface Props {
  data: GeneratedPremium;
  org: 'AKC' | 'UKC';
  inkSaver?: boolean;
}

/**
 * Standard body — the section-stacked layout used by every style whose
 * `bodyLayout === 'standard'`. Shared between AKC and UKC; the `org` prop
 * is the seam where future org-specific divergence will land.
 */
export function StandardBody({ data, org: _org, inkSaver = false }: Props) {
  const s = buildStyles(data.style, { inkSaver });
  const t = resolveTokens(data.style, { inkSaver });
  const divider = <SectionDivider style={data.style} tokens={t} />;
  const { show, secretary, officials, trials, supplemental, narratives } = data;

  return (
    <Page size="LETTER" style={s.page}>
      <Text style={s.sectionTitle}>Entry Information</Text>
      <View style={s.pullQuoteRow}>
        <View style={s.pullQuoteCell}>
          <Text style={s.pullQuoteValue}>${show.preEntryFee ?? '—'}</Text>
          <Text style={s.pullQuoteLabel}>Pre-Entry Fee</Text>
        </View>
        <View style={s.pullQuoteCell}>
          <Text style={s.pullQuoteValue}>${show.dayOfFee ?? '—'}</Text>
          <Text style={s.pullQuoteLabel}>Day-Of Fee</Text>
        </View>
        <View style={s.pullQuoteCell}>
          <Text style={s.pullQuoteValue}>
            {[show.acceptChecks && 'Checks', show.acceptCash && 'Cash']
              .filter(Boolean)
              .join(' · ') || '—'}
          </Text>
          <Text style={s.pullQuoteLabel}>Accepted Payment</Text>
        </View>
      </View>

      <View style={s.row}>
        <Text style={s.label}>Entry Opens</Text>
        <Text style={s.value}>
          {show.entryOpenDate ? formatDate(show.entryOpenDate) : REQUIRED}
        </Text>
      </View>
      <View style={s.row}>
        <Text style={s.label}>Entry Closes</Text>
        <Text style={s.value}>
          {show.entryCloseDate ? formatDate(show.entryCloseDate) : REQUIRED}
        </Text>
      </View>

      {divider}

      <Text style={s.sectionTitle}>Trial Secretary</Text>
      <View style={s.row}>
        <Text style={s.label}>Name</Text>
        <Text style={s.value}>{secretary.name ?? REQUIRED}</Text>
      </View>
      {secretary.email && (
        <View style={s.row}>
          <Text style={s.label}>Email</Text>
          <Text style={s.value}>{secretary.email}</Text>
        </View>
      )}
      {secretary.phone && (
        <View style={s.row}>
          <Text style={s.label}>Phone</Text>
          <Text style={s.value}>{formatPhone(secretary.phone)}</Text>
        </View>
      )}
      {secretary.mailingAddress && (
        <View style={s.row}>
          <Text style={s.label}>Address</Text>
          <Text style={s.value}>{secretary.mailingAddress}</Text>
        </View>
      )}

      {(officials.chairman || officials.steward) && (
        <>
          {divider}
          <Text style={s.sectionTitle}>Officials</Text>
          {officials.chairman && (
            <View style={s.row}>
              <Text style={s.label}>Trial Chairman</Text>
              <Text style={s.value}>{officials.chairman}</Text>
            </View>
          )}
          {officials.steward && (
            <View style={s.row}>
              <Text style={s.label}>Steward</Text>
              <Text style={s.value}>{officials.steward}</Text>
            </View>
          )}
        </>
      )}

      {divider}

      <Text style={s.sectionTitle}>Trials &amp; Judges</Text>
      {trials.map((trial, i) => (
        <View key={i} style={s.trialBlock}>
          <Text style={s.trialTitle}>{trial.name}</Text>
          <View style={s.row}>
            <Text style={s.label}>Date</Text>
            <Text style={s.value}>
              {formatDate(trial.date)}
              {trial.startTime ? ` at ${trial.startTime}` : ''}
            </Text>
          </View>
          {trial.eventNumber && (
            <View style={s.row}>
              <Text style={s.label}>Event #</Text>
              <Text style={s.value}>{trial.eventNumber}</Text>
            </View>
          )}
          {trial.judges.map((j, ji) => (
            <View key={ji} style={s.row}>
              <Text style={s.label}>{ji === 0 ? 'Judge' : ''}</Text>
              <Text style={s.value}>
                {j.name}
                {j.elements.length > 0 ? ` (${j.elements.join(', ')})` : ''}
              </Text>
            </View>
          ))}
          {trial.classes.length > 0 && (
            <View style={s.row}>
              <Text style={s.label}>Classes</Text>
              <Text style={s.value}>
                {trial.classes
                  .map(c => `${c.element} ${c.level}${c.section ? ` ${c.section}` : ''}`)
                  .join(', ')}
              </Text>
            </View>
          )}
        </View>
      ))}

      {divider}

      <Text style={s.sectionTitle}>Show Hours</Text>
      <Text style={s.body}>{narratives.showHours}</Text>

      {divider}

      <Text style={s.sectionTitle}>Trial Information</Text>
      <Text style={s.body}>{narratives.trialInformation}</Text>

      {divider}

      <Text style={s.sectionTitle}>Veterinary Services</Text>
      {supplemental.vetClinic ? (
        <>
          <Text style={s.body}>{supplemental.vetClinic.name}</Text>
          <Text style={s.body}>{supplemental.vetClinic.address}</Text>
          <Text style={s.body}>{formatPhone(supplemental.vetClinic.phone)}</Text>
        </>
      ) : (
        <Text style={s.required}>{REQUIRED}</Text>
      )}

      {supplemental.accommodations.length > 0 && (
        <>
          {divider}
          <Text style={s.sectionTitle}>Accommodations</Text>
          {supplemental.accommodations.map((a, i) => (
            <View key={i} style={s.trialBlock}>
              <Text style={s.trialTitle}>{a.name}</Text>
              <Text style={s.body}>{a.address}</Text>
              <Text style={s.body}>{formatPhone(a.phone)}</Text>
            </View>
          ))}
        </>
      )}

      {supplemental.hospitalityNotes && (
        <>
          {divider}
          <Text style={s.sectionTitle}>Hospitality</Text>
          <Text style={s.body}>{supplemental.hospitalityNotes}</Text>
        </>
      )}

      {supplemental.awardsDescription && (
        <>
          {divider}
          <Text style={s.sectionTitle}>Awards</Text>
          <Text style={s.body}>{supplemental.awardsDescription}</Text>
        </>
      )}

      {supplemental.additionalNotes && (
        <>
          {divider}
          <Text style={s.sectionTitle}>Additional Information</Text>
          <Text style={s.body}>{supplemental.additionalNotes}</Text>
        </>
      )}
    </Page>
  );
}
