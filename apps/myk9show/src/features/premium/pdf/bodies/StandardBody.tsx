// Shared body for both AKC and UKC. The 'org' prop is the seam for future org-specific divergence; today both orgs render identically.
import { Page, Text, View } from '@react-pdf/renderer';
import type { GeneratedPremium } from '../../../../types/premium-types';
import { buildStyles, resolveTokens } from '../pdfStyles';
import { SectionDivider } from '../SectionDivider';
import { PdfFooter } from '../PdfFooter';
import { buildPremiumFacts, REQUIRED_PLACEHOLDER as REQUIRED } from '../../premiumFacts';

interface Props {
  data: GeneratedPremium;
  org: 'AKC' | 'UKC';
  inkSaver?: boolean;
}

/**
 * Standard body — the section-stacked layout used by every style whose
 * `bodyLayout === 'standard'`. Shared between AKC and UKC; the `org` prop
 * is the seam where future org-specific divergence will land — now also
 * driving registry-aware class ordering (Phase 5b).
 */
export function StandardBody({ data, org, inkSaver = false }: Props) {
  const s = buildStyles(data.style, { inkSaver });
  const t = resolveTokens(data.style, { inkSaver });
  const divider = <SectionDivider style={data.style} tokens={t} />;
  const f = buildPremiumFacts(data, org);
  const { secretary, chair, trials } = f;

  return (
    <Page size="LETTER" style={s.page}>
      <PdfFooter style={data.style} color={t.secondaryColor} />
      <Text style={s.sectionTitle}>Entry Information</Text>
      <View style={s.pullQuoteRow}>
        <View style={s.pullQuoteCell}>
          <Text style={s.pullQuoteValue}>${f.fees.preEntry ?? '—'}</Text>
          <Text style={s.pullQuoteLabel}>Pre-Entry Fee</Text>
        </View>
        <View style={s.pullQuoteCell}>
          <Text style={s.pullQuoteValue}>${f.fees.dayOf ?? '—'}</Text>
          <Text style={s.pullQuoteLabel}>Day-Of Fee</Text>
        </View>
        <View style={s.pullQuoteCell}>
          <Text style={s.pullQuoteValue}>{f.fees.paymentMethods.join(' · ') || '—'}</Text>
          <Text style={s.pullQuoteLabel}>Accepted Payment</Text>
        </View>
      </View>

      <View style={s.row}>
        <Text style={s.label}>Entry Opens</Text>
        <Text style={s.value}>{f.entry.opens ?? REQUIRED}</Text>
      </View>
      <View style={s.row}>
        <Text style={s.label}>Entry Closes</Text>
        <Text style={s.value}>{f.entry.closes ?? REQUIRED}</Text>
      </View>

      {/* INTENT: Online via myK9Show is the primary (and revenue-generating)
          entry method — the bold value below makes that prominent across every
          standard-layout style. Mail is listed only as a backup option. */}
      <View style={s.row}>
        <Text style={s.label}>Entry Method</Text>
        <Text style={{ ...s.value, fontWeight: 700 }}>Online entries via myK9Show</Text>
      </View>
      {f.terms.map(term => (
        <View key={term.id} style={s.row}>
          <Text style={s.label}>{term.label}</Text>
          <Text style={s.value}>{term.value}</Text>
        </View>
      ))}
      {secretary.mailingAddress && (
        <View style={s.row}>
          <Text style={s.label}> </Text>
          <Text style={s.value}>Mail-in entries also accepted (see Trial Secretary).</Text>
        </View>
      )}

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
          <Text style={s.value}>{secretary.phone}</Text>
        </View>
      )}
      {secretary.mailingAddress && (
        <View style={s.row}>
          <Text style={s.label}>Address</Text>
          <Text style={s.value}>{secretary.mailingAddress}</Text>
        </View>
      )}

      {chair && (
        <>
          {divider}
          <Text style={s.sectionTitle}>Trial Chairman</Text>
          <View style={s.row}>
            <Text style={s.label}>Name</Text>
            <Text style={s.value}>{chair.name}</Text>
          </View>
          {chair.email && (
            <View style={s.row}>
              <Text style={s.label}>Email</Text>
              <Text style={s.value}>{chair.email}</Text>
            </View>
          )}
          {chair.phone && (
            <View style={s.row}>
              <Text style={s.label}>Phone</Text>
              <Text style={s.value}>{chair.phone}</Text>
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
              {trial.date}
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
          {trial.classLabels.length > 0 && (
            <View style={s.row}>
              <Text style={s.label}>Classes</Text>
              <Text style={s.value}>{trial.classLabels.join(', ')}</Text>
            </View>
          )}
        </View>
      ))}

      {divider}

      <Text style={s.sectionTitle}>Show Hours</Text>
      <Text style={s.body}>{f.showHours}</Text>

      {divider}

      <Text style={s.sectionTitle}>Trial Information</Text>
      <Text style={s.body}>{f.trialInformation}</Text>

      {divider}

      <Text style={s.sectionTitle}>Veterinary Services</Text>
      {f.vetClinic ? (
        <>
          <Text style={s.body}>{f.vetClinic.name}</Text>
          <Text style={s.body}>{f.vetClinic.address}</Text>
          <Text style={s.body}>{f.vetClinic.phone}</Text>
        </>
      ) : (
        <Text style={s.required}>{REQUIRED}</Text>
      )}

      {f.accommodations.length > 0 && (
        <>
          {divider}
          <Text style={s.sectionTitle}>Accommodations</Text>
          {f.accommodations.map((a, i) => (
            <View key={i} style={s.trialBlock}>
              <Text style={s.trialTitle}>{a.name}</Text>
              <Text style={s.body}>{a.address}</Text>
              <Text style={s.body}>{a.phone}</Text>
            </View>
          ))}
        </>
      )}

      {f.hospitalityNotes && (
        <>
          {divider}
          <Text style={s.sectionTitle}>Hospitality</Text>
          <Text style={s.body}>{f.hospitalityNotes}</Text>
        </>
      )}

      {f.awardsDescription && (
        <>
          {divider}
          <Text style={s.sectionTitle}>Awards</Text>
          <Text style={s.body}>{f.awardsDescription}</Text>
        </>
      )}

      {f.additionalNotes && (
        <>
          {divider}
          <Text style={s.sectionTitle}>Additional Information</Text>
          <Text style={s.body}>{f.additionalNotes}</Text>
        </>
      )}
    </Page>
  );
}
