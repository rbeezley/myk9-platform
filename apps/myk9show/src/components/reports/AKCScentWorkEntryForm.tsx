import React from 'react';
import type { ReportProps } from '@/lib/reports/types';
import { useEntryFormData } from '@/hooks/queries/useEntryFormData';
import { buildClassGrid, sortEntryFormDogs } from '@/lib/reports/entryFormUtils';
import { formatReportDate } from '@/lib/reports/reportUtils';
import {
  AKC_SCENT_WORK_ELEMENTS,
  AKC_SCENT_WORK_LEVELS,
  ELEMENT_COLUMN_HEADERS,
} from '@/lib/reports/entryFormTypes';
import type {
  EntryFormDog,
  EntryFormSecretary,
  EntryFormTrial,
  GridCell,
} from '@/lib/reports/entryFormTypes';

// ─── Static AKC Agreement Text ────────────────────────────────────────────

const AKC_AGREEMENT_TEXT = `I certify that I am the actual owner of the dog, or that I am the duly authorized agent of the actual owner whose name I have entered. In consideration of the acceptance of this entry, I (we) agree to abide by the rules and regulations of The American Kennel Club in effect at the time of this event, and any additional rules and regulations appearing in the premium list of this event and entry form and any decision made in accord with them. I (we) agree that the club holding this event has the right to refuse this entry for cause which the club shall deem sufficient. I (we) certify and represent that the dog entered is not a hazard to persons or other dogs. In consideration of the acceptance of this entry and of the holding of this event and of the opportunity to have the dog judged and to win prizes, ribbons, or trophies, I (we) agree to hold the AKC, the event-giving club, their members, directors, governors, officers, agents, superintendents or event secretary and the owner and/or lessor of the premises and any provider of services that are necessary to hold this event and any employees or volunteers of the aforementioned parties, and any AKC approved judge, judging at this event, harmless from any claim for loss or injury which may be alleged to have been caused directly or indirectly to any person or thing by the act of this dog while in or about the event premises or grounds or near any entrance thereto, and I (we) personally assume all responsibility and liability for any such claim; and I (we) further agree to hold the aforementioned parties harmless from any claim of loss, injury or damage to this dog.`;

const AKC_AGREEMENT_TEXT_2 = `Additionally, I (we) hereby assume the sole responsibility for and agree to indemnify, defend and save the aforementioned parties harmless from any and all loss and expense (including legal fees) by reason of the liability imposed by law upon any of the aforementioned parties for damage because of bodily injuries, including death at any time resulting therefrom, sustained by any person or persons, including myself (ourselves), or on account of damage to property, arising out of or in consequence of my (our) participation in this event, however such injuries, death or property damage may be caused, and whether or not the same may have been caused or may be alleged to have been caused by the negligence of the aforementioned parties or any of their employees, agents, or any other person.`;

const AKC_ARBITRATION_TEXT = `I (WE) AGREE THAT ANY CAUSE OF ACTION, CONTROVERSY OR CLAIM ARISING OUT OF OR RELATED TO THE ENTRY, EXHIBITION OR ATTENDANCE AT THE EVENT BETWEEN THE AKC AND THE EVENT-GIVING CLUB (UNLESS OTHERWISE STATED IN THIS PREMIUM LIST) AND MYSELF (OURSELVES) OR AS TO THE CONSTRUCTION, INTERPRETATION AND EFFECT OF THIS AGREEMENT SHALL BE SETTLED BY ARBITRATION PURSUANT TO THE APPLICABLE RULES OF THE AMERICAN ARBITRATION ASSOCIATION. HOWEVER, PRIOR TO ARBITRATION ALL APPLICABLE AKC BYLAWS, RULES, REGULATIONS, AND PROCEDURES MUST FIRST BE FOLLOWED AS SET FORTH IN THE AKC CHARTER AND BYLAWS, RULES, REGULATIONS, PUBLISHED POLICIES AND GUIDELINES.`;

// ─── Styles ───────────────────────────────────────────────────────────────

const styles = {
  page: {
    fontFamily: 'Arial, Helvetica, sans-serif',
    fontSize: '9px',
    lineHeight: '1.3',
    color: '#000',
    background: '#fff',
    padding: '0.3in',
    pageBreakBefore: 'always' as const,
    maxWidth: '8.5in',
  },
  firstPage: {
    pageBreakBefore: 'auto' as const,
  },
  header: {
    textAlign: 'center' as const,
    marginBottom: '8px',
  },
  title: {
    fontWeight: 'bold' as const,
    fontSize: '12px',
    margin: '0 0 2px 0',
  },
  addressLine: {
    fontSize: '9px',
    margin: '0',
  },
  grid: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '7.5px',
    marginBottom: '6px',
  },
  gridHeader: {
    border: '1px solid #000',
    padding: '2px 3px',
    fontWeight: 'bold' as const,
    background: '#f0f0f0',
    textAlign: 'center' as const,
  },
  gridCell: {
    border: '1px solid #000',
    padding: '2px 3px',
    fontSize: '7px',
    verticalAlign: 'top' as const,
  },
  trialLabel: {
    border: '1px solid #000',
    padding: '2px 3px',
    fontWeight: 'bold' as const,
    fontSize: '7px',
    width: '12%',
  },
  detCell: {
    border: '1px solid #000',
    padding: '2px 3px',
    textAlign: 'center' as const,
    width: '6%',
  },
  infoTable: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '8px',
    marginBottom: '4px',
  },
  infoCell: {
    border: '1px solid #000',
    padding: '2px 4px',
  },
  label: {
    fontWeight: 'bold' as const,
  },
  optionalLabel: {
    color: '#888',
  },
  agreement: {
    fontSize: '6.5px',
    lineHeight: '1.25',
    marginTop: '8px',
  },
  agreementTitle: {
    fontWeight: 'bold' as const,
    fontSize: '8px',
    textAlign: 'center' as const,
    marginBottom: '2px',
  },
  consentNote: {
    marginTop: '4px',
    fontSize: '7px',
    fontStyle: 'italic' as const,
    color: '#666',
  },
} as const;

// ─── Sub-components ───────────────────────────────────────────────────────

function FormHeader({ secretary }: { secretary: EntryFormSecretary | null }) {
  return (
    <div style={styles.header}>
      <p style={styles.title}>OFFICIAL ENTRY FORM</p>
      <p style={styles.addressLine}>Entries should be sent to:</p>
      {secretary ? (
        <>
          <p style={styles.addressLine}>{secretary.name}</p>
          {secretary.streetAddress && <p style={styles.addressLine}>{secretary.streetAddress}</p>}
          <p style={styles.addressLine}>
            {[secretary.city, secretary.state].filter(Boolean).join(', ')}
            {secretary.zipCode ? ` ${secretary.zipCode}` : ''}
          </p>
        </>
      ) : (
        <p style={styles.addressLine}>[Secretary info not available]</p>
      )}
    </div>
  );
}

function ClassGridCell({ cell, isDetective }: { cell: GridCell; isDetective: boolean }) {
  if (isDetective) {
    // Detective column is a single checkbox
    const checked = cell.checkedLevels.size > 0;
    return <td style={styles.detCell}>{checked ? '\u2611' : '\u2610'}</td>;
  }

  return (
    <td style={styles.gridCell}>
      {AKC_SCENT_WORK_LEVELS.map(level => {
        const isChecked = cell.checkedLevels.has(level);
        const checkbox = isChecked ? '\u2611' : '\u2610';
        const noviceSuffix = level === 'Novice' && cell.noviceClass ? ` (${cell.noviceClass})` : '';
        const label = level === 'Novice' ? `Novice A / B${noviceSuffix}` : level;
        return (
          <div key={level} style={isChecked ? { fontWeight: 'bold' } : undefined}>
            {checkbox} {label}
          </div>
        );
      })}
    </td>
  );
}

function ClassGrid({
  grid,
  trials,
}: {
  grid: Map<string, Map<string, GridCell>>;
  trials: EntryFormTrial[];
}) {
  const emptyCell: GridCell = { checkedLevels: new Set(), noviceClass: null };

  return (
    <table style={styles.grid}>
      <thead>
        <tr>
          <th style={styles.gridHeader}>Trial</th>
          {AKC_SCENT_WORK_ELEMENTS.map(el => (
            <th key={el} style={styles.gridHeader}>
              {ELEMENT_COLUMN_HEADERS[el]}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {trials.map(trial => {
          const elementMap = grid.get(trial.id);
          return (
            <tr key={trial.id}>
              <td style={styles.trialLabel}>
                Trial {trial.trialNumber}
                <br />
                {formatReportDate(trial.date)}
              </td>
              {AKC_SCENT_WORK_ELEMENTS.map(el => (
                <ClassGridCell
                  key={el}
                  cell={elementMap?.get(el) ?? emptyCell}
                  isDetective={el === 'Detective'}
                />
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function DogInfoTable({ dog }: { dog: EntryFormDog }) {
  const reg = dog.registration;
  const isAkc = reg?.organization === 'AKC' || reg?.organization === 'PAL';
  const isForeign = reg?.organization === 'Foreign';
  const ownerName = `${dog.owner.firstName ?? ''} ${dog.owner.lastName ?? ''}`.trim();

  return (
    <table style={styles.infoTable}>
      <tbody>
        <tr>
          <td style={styles.infoCell} colSpan={3}>
            <span style={styles.label}>AKC Registered Name: </span>
            {reg?.registeredName ?? dog.callName}
          </td>
          <td style={styles.infoCell} colSpan={2}>
            <span style={styles.label}>Registration #: </span>
            {reg?.registrationNumber ?? ''}
            {'  '}
            {isAkc ? '\u2611' : '\u2610'} AKC/PAL/ILP/CP{'  '}
            {isForeign ? '\u2611' : '\u2610'} Foreign
          </td>
        </tr>
        <tr>
          <td style={styles.infoCell}>
            <span style={styles.label}>Call name: </span>
            {dog.callName}
          </td>
          <td style={styles.infoCell}>
            <span style={styles.optionalLabel}>Date of birth: </span>
            {dog.dateOfBirth ? formatReportDate(dog.dateOfBirth) : ''}
          </td>
          <td style={styles.infoCell}>
            <span style={styles.label}>Sex: </span>
            {dog.sex ?? ''}
          </td>
          <td style={styles.infoCell} colSpan={2}>
            <span style={styles.label}>Breed: </span>
            {dog.breed}
            {reg?.variety ? ` — Variety: ${reg.variety}` : ''}
          </td>
        </tr>
        <tr>
          <td style={styles.infoCell} colSpan={2}>
            <span style={styles.optionalLabel}>Breeder: </span>
            {dog.breeder ?? ''}
          </td>
          <td style={styles.infoCell} colSpan={3}>
            <span style={styles.optionalLabel}>Sire: </span>
            {dog.sire ?? ''}
          </td>
        </tr>
        <tr>
          <td style={styles.infoCell} colSpan={5}>
            <span style={styles.optionalLabel}>Dam: </span>
            {dog.dam ?? ''}
          </td>
        </tr>
        <tr>
          <td style={styles.infoCell} colSpan={5}>
            <span style={styles.label}>Owner: </span>
            {ownerName}
          </td>
        </tr>
        <tr>
          <td style={styles.infoCell} colSpan={5}>
            <span style={styles.label}>Owner&apos;s Address: </span>
            {dog.owner.streetAddress ?? ''}
          </td>
        </tr>
        <tr>
          <td style={styles.infoCell} colSpan={2}>
            <span style={styles.label}>City: </span>
            {dog.owner.city ?? ''}
          </td>
          <td style={styles.infoCell}>
            <span style={styles.label}>State: </span>
            {dog.owner.state ?? ''}
          </td>
          <td style={styles.infoCell} colSpan={2}>
            <span style={styles.label}>Zip: </span>
            {dog.owner.zipCode ?? ''}
          </td>
        </tr>
        <tr>
          <td style={styles.infoCell} colSpan={2}>
            <span style={styles.label}>Telephone: </span>
            {dog.owner.phone ?? ''}
          </td>
          <td style={styles.infoCell} colSpan={3}>
            <span style={styles.label}>Email: </span>
            {dog.owner.email ?? ''}
          </td>
        </tr>
        {dog.handler && (
          <tr>
            <td style={styles.infoCell} colSpan={5}>
              <span style={styles.label}>Handler name (if different from owner): </span>
              {dog.handler}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function AgreementSection({ agreementDate }: { agreementDate: string | null }) {
  const formattedDate = agreementDate ? formatReportDate(agreementDate.split('T')[0]) : 'unknown';

  return (
    <div style={styles.agreement}>
      <p style={styles.agreementTitle}>AGREEMENT</p>
      <p>{AKC_AGREEMENT_TEXT}</p>
      <p>{AKC_AGREEMENT_TEXT_2}</p>
      <p>{AKC_ARBITRATION_TEXT}</p>
      <p style={styles.consentNote}>
        Entered via myK9Show &mdash; agreement accepted digitally on {formattedDate}
      </p>
    </div>
  );
}

// ─── Single form page for one dog ─────────────────────────────────────────

function EntryFormPage({
  dog,
  secretary,
  trials,
  isFirst,
}: {
  dog: EntryFormDog;
  secretary: EntryFormSecretary | null;
  trials: EntryFormTrial[];
  isFirst: boolean;
}) {
  const grid = buildClassGrid(dog.entries, trials);

  return (
    <div style={{ ...styles.page, ...(isFirst ? styles.firstPage : {}) }}>
      <FormHeader secretary={secretary} />
      <ClassGrid grid={grid} trials={trials} />
      <DogInfoTable dog={dog} />
      <AgreementSection agreementDate={dog.agreementDate} />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────

export const AKCScentWorkEntryForm: React.FC<ReportProps> = ({
  showId,
  sortOrder,
  dogId,
  trialId,
}) => {
  const { dogs, secretary, trials, isLoading, isError } = useEntryFormData({
    showId: showId ?? '',
    trialId,
    dogId,
  });

  if (!showId) {
    return (
      <div className="report-page">
        <p style={{ color: '#888', textAlign: 'center', paddingTop: '2in' }}>
          Show ID is required to generate entry forms.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="report-page">
        <p style={{ color: '#888', textAlign: 'center', paddingTop: '2in' }}>
          Loading entry form data...
        </p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="report-page">
        <p style={{ color: '#c00', textAlign: 'center', paddingTop: '2in' }}>
          Failed to load entry form data.
        </p>
      </div>
    );
  }

  if (dogs.length === 0) {
    return (
      <div className="report-page">
        <p style={{ color: '#888', textAlign: 'center', paddingTop: '2in' }}>
          No entries found for this selection.
        </p>
      </div>
    );
  }

  const sortedDogs = sortEntryFormDogs(dogs, sortOrder);

  return (
    <>
      {sortedDogs.map((dog, index) => (
        <EntryFormPage
          key={dog.dogId}
          dog={dog}
          secretary={secretary}
          trials={trials}
          isFirst={index === 0}
        />
      ))}
    </>
  );
};
