import { Document, Image, Page, Text, View } from '@react-pdf/renderer';
import type { GeneratedPremium } from '../../../types/premium-types';
import { buildStyles, formatDate, formatPhone } from './pdfStyles';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const REQUIRED = '[REQUIRED — add before submitting]';

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  premium: GeneratedPremium;
}

export function UKCPremiumTemplate({ premium }: Props) {
  const s = buildStyles(premium.style);
  const { show, club, secretary, officials, trials, supplemental, narratives } = premium;

  return (
    <Document>
      <Page size="LETTER" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          {club.logoUrl && (
            <Image src={club.logoUrl} style={{ width: 60, height: 60, marginBottom: 6 }} />
          )}
          <Text style={s.clubName}>{club.name}</Text>
          <Text style={s.showName}>{show.name}</Text>
          <Text style={s.subheader}>
            {formatDate(show.startDate)}
            {show.endDate !== show.startDate ? ` – ${formatDate(show.endDate)}` : ''}
          </Text>
          <Text style={s.subheader}>{show.venue}</Text>
        </View>

        <View style={s.divider} />

        {/* Entry Information */}
        <Text style={s.sectionTitle}>ENTRY INFORMATION</Text>
        <View style={s.row}>
          <Text style={s.label}>Entry Opens:</Text>
          <Text style={s.value}>
            {show.entryOpenDate ? formatDate(show.entryOpenDate) : REQUIRED}
          </Text>
        </View>
        <View style={s.row}>
          <Text style={s.label}>Entry Closes:</Text>
          <Text style={s.value}>
            {show.entryCloseDate ? formatDate(show.entryCloseDate) : REQUIRED}
          </Text>
        </View>
        <View style={s.row}>
          <Text style={s.label}>Pre-Entry Fee:</Text>
          <Text style={s.value}>${show.preEntryFee}</Text>
        </View>
        <View style={s.row}>
          <Text style={s.label}>Day-Of Fee:</Text>
          <Text style={s.value}>${show.dayOfFee}</Text>
        </View>
        <View style={s.row}>
          <Text style={s.label}>Payment:</Text>
          <Text style={s.value}>
            {[show.acceptChecks && 'Checks', show.acceptCash && 'Cash']
              .filter(Boolean)
              .join(', ') || 'See event details'}
          </Text>
        </View>

        <View style={s.divider} />

        {/* Secretary */}
        <Text style={s.sectionTitle}>TRIAL SECRETARY</Text>
        <View style={s.row}>
          <Text style={s.label}>Name:</Text>
          <Text style={s.value}>{secretary.name ?? REQUIRED}</Text>
        </View>
        {secretary.email && (
          <View style={s.row}>
            <Text style={s.label}>Email:</Text>
            <Text style={s.value}>{secretary.email}</Text>
          </View>
        )}
        {secretary.phone && (
          <View style={s.row}>
            <Text style={s.label}>Phone:</Text>
            <Text style={s.value}>{formatPhone(secretary.phone)}</Text>
          </View>
        )}
        {secretary.mailingAddress && (
          <View style={s.row}>
            <Text style={s.label}>Address:</Text>
            <Text style={s.value}>{secretary.mailingAddress}</Text>
          </View>
        )}

        {/* Officials */}
        {(officials.chairman || officials.steward) && (
          <>
            <View style={s.divider} />
            <Text style={s.sectionTitle}>OFFICIALS</Text>
            {officials.chairman && (
              <View style={s.row}>
                <Text style={s.label}>Trial Chairman:</Text>
                <Text style={s.value}>{officials.chairman}</Text>
              </View>
            )}
            {officials.steward && (
              <View style={s.row}>
                <Text style={s.label}>Steward:</Text>
                <Text style={s.value}>{officials.steward}</Text>
              </View>
            )}
          </>
        )}

        <View style={s.divider} />

        {/* Trials */}
        <Text style={s.sectionTitle}>TRIALS &amp; JUDGES</Text>
        {trials.map((trial, i) => (
          <View key={i} style={s.trialBlock}>
            <Text style={s.trialTitle}>{trial.name}</Text>
            <View style={s.row}>
              <Text style={s.label}>Date:</Text>
              <Text style={s.value}>
                {formatDate(trial.date)}
                {trial.startTime ? ` at ${trial.startTime}` : ''}
              </Text>
            </View>
            {trial.eventNumber && (
              <View style={s.row}>
                <Text style={s.label}>Event #:</Text>
                <Text style={s.value}>{trial.eventNumber}</Text>
              </View>
            )}
            {trial.judges.map((j, ji) => (
              <View key={ji} style={s.row}>
                <Text style={s.label}>{ji === 0 ? 'Judge:' : ''}</Text>
                <Text style={s.value}>
                  {j.name}
                  {j.elements.length > 0 ? ` (${j.elements.join(', ')})` : ''}
                </Text>
              </View>
            ))}
            {trial.classes.length > 0 && (
              <View style={s.row}>
                <Text style={s.label}>Classes:</Text>
                <Text style={s.value}>
                  {trial.classes
                    .map(c => `${c.element} ${c.level}${c.section ? ` Sec. ${c.section}` : ''}`)
                    .join(', ')}
                </Text>
              </View>
            )}
          </View>
        ))}

        <View style={s.divider} />

        {/* Show Hours */}
        <Text style={s.sectionTitle}>SHOW HOURS</Text>
        <Text style={s.body}>{narratives.showHours}</Text>

        <View style={s.divider} />

        {/* Trial Information */}
        <Text style={s.sectionTitle}>TRIAL INFORMATION</Text>
        <Text style={s.body}>{narratives.trialInformation}</Text>

        <View style={s.divider} />

        {/* Supplemental */}
        <Text style={s.sectionTitle}>VETERINARY SERVICES</Text>
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
            <View style={s.divider} />
            <Text style={s.sectionTitle}>ACCOMMODATIONS</Text>
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
            <View style={s.divider} />
            <Text style={s.sectionTitle}>HOSPITALITY</Text>
            <Text style={s.body}>{supplemental.hospitalityNotes}</Text>
          </>
        )}

        {supplemental.awardsDescription && (
          <>
            <View style={s.divider} />
            <Text style={s.sectionTitle}>AWARDS</Text>
            <Text style={s.body}>{supplemental.awardsDescription}</Text>
          </>
        )}

        {supplemental.additionalNotes && (
          <>
            <View style={s.divider} />
            <Text style={s.sectionTitle}>ADDITIONAL INFORMATION</Text>
            <Text style={s.body}>{supplemental.additionalNotes}</Text>
          </>
        )}

        <View style={s.divider} />

        {/* UKC-specific boilerplate */}
        <Text style={s.sectionTitle}>REGISTRATION REQUIREMENT</Text>
        <Text style={s.boilerplate}>
          A UKC REGISTRATION NUMBER IS REQUIRED TO PARTICIPATE IN LICENSED TRIALS. For information
          on UKC registration and rules: www.ukcdogs.com.
        </Text>

        <View style={s.divider} />

        <Text style={s.sectionTitle}>WAIVER</Text>
        <Text style={s.boilerplate}>
          All events are held under the Official Rules and Regulations of the United Kennel Club. By
          entering, exhibitors agree to be bound by said rules and regulations and release the
          United Kennel Club, the hosting club, and all officials from any liability whatsoever.
        </Text>
      </Page>
    </Document>
  );
}
