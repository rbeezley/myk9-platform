import React from 'react';
import type { ReportEntry } from '@/lib/reports/types';
import {
  CATALOG_RESULT,
  catalogPlacement,
  catalogRows,
  countCatalogClass,
  formatCatalogDate,
  resolveCatalogResult,
} from '@/lib/reports/catalogFields';
import {
  formatReportHandlerName,
  formatReportTime,
  formatTimeLimit,
} from '@/lib/reports/reportUtils';
import { formatArmbandDisplay } from '@/utils/armbandUtils';

export interface AkcMarkedCatalogClassData {
  id: string;
  className: string;
  /** Trial label and date, e.g. "Trial 1 — 11/9/2026"; printed before the class name. */
  trialHeading?: string | undefined;
  judgeName?: string | undefined;
  timeLimitSeconds?: number | null | undefined;
  /** Already sorted by the host report's sort order. */
  entries: ReportEntry[];
}

/** Results that were run, so a time and a fault count mean something. */
const RAN_RESULTS: ReadonlySet<string> = new Set([
  CATALOG_RESULT.QUALIFIED,
  CATALOG_RESULT.NOT_QUALIFIED,
  CATALOG_RESULT.EXCUSED,
  CATALOG_RESULT.DISQUALIFIED,
]);

/** A reason is printed only for the two results the AKC catalog explains (§36). */
const EXPLAINED_RESULTS: ReadonlySet<string> = new Set([
  CATALOG_RESULT.EXCUSED,
  CATALOG_RESULT.DISQUALIFIED,
]);

const COLUMNS: ReadonlyArray<{ label: string; width: string }> = [
  { label: 'Armband', width: '6%' },
  { label: 'AKC Reg #', width: '10%' },
  { label: 'Date of Birth', width: '9%' },
  { label: 'Registered / Call Name', width: '19%' },
  { label: 'Breed', width: '11%' },
  { label: 'Owner', width: '21%' },
  { label: 'Time', width: '7%' },
  { label: 'Faults', width: '5%' },
  { label: 'Result', width: '7%' },
  { label: 'Place', width: '5%' },
];

/**
 * One class of the AKC marked catalog (Scent Work Regulations Ch.3 §36): the
 * class header the regulations require, then one line per dog with the owner's
 * name and address inline. Rendered as a <tbody> of the catalog's single table.
 */
const AkcMarkedCatalogClass: React.FC<{ data: AkcMarkedCatalogClassData }> = ({ data }) => {
  const rows = catalogRows(data.entries);
  const counts = countCatalogClass(rows);

  const facts: Array<[string, string | number]> = [
    ['Entries', counts.entries],
    ['Competing', counts.competing],
    ['Qualifying', counts.qualifying],
    ['Withdrawn', counts.withdrawn],
    ['Judge', data.judgeName ?? ''],
    ['Maximum time', formatTimeLimit(data.timeLimitSeconds)],
  ];

  return (
    <tbody className="catalog-class-section">
      <tr>
        <td colSpan={COLUMNS.length} className="catalog-class-heading">
          <h2>
            {data.trialHeading ? `${data.trialHeading} — ` : ''}
            {data.className}
          </h2>
        </td>
      </tr>
      <tr className="catalog-class-facts-row">
        <td colSpan={COLUMNS.length}>
          <dl className="catalog-class-facts">
            {facts.map(([label, value]) => (
              <div key={label} className="catalog-class-fact">
                <dt>{label}: </dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </td>
      </tr>
      {rows.length === 0 ? (
        <tr>
          <td colSpan={COLUMNS.length} className="catalog-empty">
            No results for this class.
          </td>
        </tr>
      ) : (
        rows.map(entry => {
          const result = resolveCatalogResult(entry);
          const ran = RAN_RESULTS.has(result);
          return (
            <tr key={entry.id}>
              <td>{formatArmbandDisplay(entry.armband)}</td>
              <td>{entry.registrationNumber ?? ''}</td>
              <td>{formatCatalogDate(entry.dateOfBirth)}</td>
              <td>
                {entry.registeredName ?? ''}
                <span className="catalog-subline">Call: {entry.callName}</span>
              </td>
              <td>{entry.breed}</td>
              <td>
                {entry.ownerName ?? ''}
                {entry.ownerAddress ? (
                  <span className="catalog-subline">{entry.ownerAddress}</span>
                ) : entry.ownerAddressMissing ? (
                  <span className="catalog-subline catalog-flag">No address on file</span>
                ) : null}
                {entry.handlerDiffersFromOwner ? (
                  <span className="catalog-subline">Handler: {formatReportHandlerName(entry)}</span>
                ) : null}
              </td>
              <td>{ran ? formatReportTime(entry.searchTimeSeconds) : ''}</td>
              <td>{ran ? (entry.totalFaults ?? '') : ''}</td>
              <td className={result === CATALOG_RESULT.QUALIFIED ? 'qualified-text' : 'nq-text'}>
                {result}
                {EXPLAINED_RESULTS.has(result) && entry.resultReason ? (
                  <span className="catalog-reason">{entry.resultReason}</span>
                ) : null}
              </td>
              <td>{catalogPlacement(entry)}</td>
            </tr>
          );
        })
      )}
    </tbody>
  );
};

/**
 * The whole AKC marked catalog body as ONE table, so the column headings and the
 * judge's-initials box (<tfoot>) repeat on every printed page. See catalogStyles.ts.
 */
export const AkcMarkedCatalogTable: React.FC<{ classes: AkcMarkedCatalogClassData[] }> = ({
  classes,
}) => (
  <table className="report-table catalog-akc-table">
    <colgroup>
      {COLUMNS.map(column => (
        <col key={column.label} style={{ width: column.width }} />
      ))}
    </colgroup>
    <thead>
      <tr>
        {COLUMNS.map(column => (
          <th key={column.label}>{column.label}</th>
        ))}
      </tr>
    </thead>
    {classes.map(data => (
      <AkcMarkedCatalogClass key={data.id} data={data} />
    ))}
    <tfoot>
      <tr>
        <td colSpan={COLUMNS.length}>
          <JudgeInitialsBox />
        </td>
      </tr>
    </tfoot>
  </table>
);

/** The box the judge initials each page with (AKC Ch.3 §37). */
export const JudgeInitialsBox: React.FC = () => (
  <div className="catalog-initials">
    <span>Judge&apos;s initials</span>
    <span className="catalog-initials-box" />
  </div>
);
