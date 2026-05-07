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
import { getRegistry } from '@/features/registries';

// AKC agreement text is sourced from the registry config layer so legal copy
// has a single canonical location across premium PDF, entry blank, and email.
const AKC_AGREEMENT_PARAGRAPHS = getRegistry('AKC').exhibitorAgreement.split('\n\n');

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
      {AKC_AGREEMENT_PARAGRAPHS.map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
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
