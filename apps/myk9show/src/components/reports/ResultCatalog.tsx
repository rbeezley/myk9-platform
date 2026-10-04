import React from 'react';
import type { ReportProps, ReportEntry } from '@/lib/reports/types';
import {
  formatReportTime,
  formatReportHandlerName,
  sortByPlacement,
  sortByArmband,
  sortByHandler,
  isValidSection,
  getResultStatusText,
  isQualified,
  countQualified,
} from '@/lib/reports/reportUtils';
import { formatArmbandDisplay } from '@/utils/armbandUtils';
import { formatTrialLabel } from '@myk9/core';
import { resolveConfiguredRegistryId } from '@/features/registries';
import { formatCatalogDate } from '@/lib/reports/catalogFields';
import { AkcMarkedCatalogTable } from './AkcMarkedCatalogClass';

function trialHeading(
  trial: { name?: string | undefined; trialNumber: string; date: string } | undefined
): string {
  if (!trial) return '';
  const label = formatTrialLabel({ name: trial.name, trialNumber: trial.trialNumber });
  const date = formatCatalogDate(trial.date);
  return date ? `${label} — ${date}` : label;
}

/**
 * INTENT: on an AKC show the Result Catalog is the AKC marked catalog (Scent Work
 * Regulations Ch.3 §36-37). There the judge no longer signs and dates each class; instead EVERY
 * printed page carries a "Judge's initials" box, because the regulation has the
 * judge initial each page of the marked catalog. On an AKC show the box is the
 * <tfoot> of the catalog's single table (see catalogStyles.ts), which is what
 * makes it repeat on each page however the classes break across them. The
 * secretary still gets the "Collect judge's initials" action from the show-map
 * wrap-up; that action opens this report. Owner-approved (MYK9-1009).
 */
export const ResultCatalog: React.FC<ReportProps> = ({
  showName,
  organization,
  showDates,
  allClasses = [],
  allTrials = [],
  catalogProfilesReadComplete = true,
  entries,
  sortOrder,
}) => {
  if (entries.length === 0) {
    return (
      <div className="report-page">
        <p className="catalog-empty">No results found.</p>
      </div>
    );
  }

  // Group entries by classId
  const entriesByClass = new Map<string, ReportEntry[]>();
  for (const entry of entries) {
    const key = entry.classId ?? 'unknown';
    if (!entriesByClass.has(key)) entriesByClass.set(key, []);
    entriesByClass.get(key)!.push(entry);
  }

  function sortClassEntries(classEntries: ReportEntry[]): ReportEntry[] {
    if (sortOrder === 'armband') return sortByArmband(classEntries);
    if (sortOrder === 'handler') return sortByHandler(classEntries);
    return sortByPlacement(classEntries); // default: 'placement'
  }

  // A class is AKC when its trial names AKC; a trial with no registry falls back
  // to the show's organization, then to AKC (the same default the mapper uses).
  // A show never mixes registries (MYK9-490), so the layout is chosen per show.
  function isAkcClass(trialId: string): boolean {
    const trial = allTrials.find(item => item.id === trialId);
    return (resolveConfiguredRegistryId(trial?.registryId ?? organization) ?? 'AKC') === 'AKC';
  }

  const showIsAkc = allClasses.length > 0 && allClasses.every(cls => isAkcClass(cls.trialId));
  const orgTitle = organization ? `${organization} Scent Work` : 'Scent Work';

  return (
    <div className="report-page">
      <div className="report-header">
        <div className="report-logo">myK9Show</div>
        <h1 className="report-title">
          {orgTitle} {showIsAkc ? 'Marked Catalog' : 'Show Results'}
        </h1>
        {showName && <p className="report-subtitle">{showName}</p>}
        {showDates && <p className="report-subtitle">{showDates}</p>}
      </div>

      {showIsAkc && !catalogProfilesReadComplete ? (
        <p className="catalog-notice" role="alert">
          Owner addresses and dates of birth could not be loaded — reprint when online before
          sending to AKC.
        </p>
      ) : null}

      {showIsAkc ? (
        <AkcMarkedCatalogTable
          classes={allClasses.map(cls => ({
            id: cls.id,
            // Same convention as the Show Catalog and Judge's Schedule: trial label,
            // then the date, shown on every class so a multi-trial show is unambiguous.
            trialHeading: trialHeading(allTrials.find(item => item.id === cls.trialId)),
            className: [cls.element, cls.level, isValidSection(cls.section) ? cls.section : '']
              .filter(Boolean)
              .join(' '),
            judgeName: cls.judgeName,
            timeLimitSeconds: cls.timeLimitSeconds,
            entries: sortClassEntries(entriesByClass.get(cls.id) ?? []),
          }))}
        />
      ) : (
        <>
          {allClasses.map(cls => {
            const classEntries = sortClassEntries(entriesByClass.get(cls.id) ?? []);
            const className = `${cls.element} ${cls.level}`.trim();
            const qualifiedCount = countQualified(classEntries);

            return (
              <div key={cls.id} className="catalog-class-section">
                <h2 className="catalog-class-header">{className}</h2>
                {classEntries.length === 0 ? (
                  <p className="catalog-empty">No results for this class.</p>
                ) : (
                  <>
                    <table className="report-table">
                      <thead>
                        <tr>
                          <th>Place</th>
                          <th>Armband</th>
                          <th>Call Name</th>
                          <th>Breed</th>
                          <th>Reg #</th>
                          <th>Handler</th>
                          <th>Q</th>
                          <th>Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {classEntries.map(entry => {
                          const qualified = isQualified(entry);
                          const statusText = getResultStatusText(entry);
                          const placement =
                            entry.finalPlacement && entry.finalPlacement < 9000
                              ? entry.finalPlacement
                              : '';
                          return (
                            <tr key={entry.id}>
                              <td>{placement}</td>
                              <td>{formatArmbandDisplay(entry.armband)}</td>
                              <td>{entry.callName}</td>
                              <td>{entry.breed}</td>
                              <td>{entry.registrationNumber ?? ''}</td>
                              <td>{formatReportHandlerName(entry)}</td>
                              <td className={qualified ? 'qualified-text' : 'nq-text'}>
                                {statusText}
                              </td>
                              <td>{formatReportTime(entry.searchTimeSeconds)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <p className="catalog-class-summary">
                      Entries: {classEntries.length} · Qualified: {qualifiedCount}
                    </p>
                    {/*
                      INTENT: outside AKC each class section still ends with a judge
                      signature + date line; UKC/ASCA sign-off is unchanged by MYK9-1009.
                    */}
                    <div className="form-signature-section catalog-class-signature">
                      <div className="signature-line">
                        <span className="signature-label">Judge&apos;s Signature:</span>
                        <span className="signature-blank" />
                      </div>
                      <div className="signature-line">
                        <span className="signature-label">Date:</span>
                        <span className="signature-blank" />
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </>
      )}

      <div className="report-footer">
        <div className="footer-right">Generated by myK9Show</div>
      </div>
    </div>
  );
};
