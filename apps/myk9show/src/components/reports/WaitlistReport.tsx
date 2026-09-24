import React from 'react';
import { formatTrialLabel } from '@myk9/core';
import type { ReportProps, ReportWaitlistRow } from '@/lib/reports/types';
import { formatReportDate } from '@/lib/reports/reportUtils';

/**
 * MYK9-717: the waitlist is `waitlist_entries`, resolved by the host into
 * `waitlist` — never `entries`, whose status constraint forbids a waitlist
 * value. Trials and classes come from `allTrials` / `allClasses`, which the
 * host has already narrowed to the selected trial, so a waitlist row for a
 * class outside that scope is dropped rather than printed under no heading.
 */
export const WaitlistReport: React.FC<ReportProps> = ({
  showName,
  organization,
  allTrials = [],
  allClasses = [],
  waitlist,
}) => {
  const orgTitle = organization ? `${organization} Scent Work` : 'Scent Work';

  const header = (
    <div className="report-header">
      <div className="report-logo">myK9Show</div>
      <h1 className="report-title">{orgTitle} Waitlist</h1>
      {showName && <p className="report-subtitle">{showName}</p>}
    </div>
  );

  if (waitlist?.isError) {
    return (
      <div className="report-page">
        {header}
        <p role="alert" className="report-warning">
          We couldn&apos;t load the waitlist, so this report is not complete. Close it and open it
          again to retry.
        </p>
      </div>
    );
  }

  const rowsByClass = new Map<string, ReportWaitlistRow[]>();
  for (const row of waitlist?.data ?? []) {
    const rows = rowsByClass.get(row.classId) ?? [];
    rows.push(row);
    rowsByClass.set(row.classId, rows);
  }

  const trials = allTrials
    .map(trial => ({
      trial,
      classes: allClasses.filter(c => c.trialId === trial.id && rowsByClass.has(c.id)),
    }))
    .filter(t => t.classes.length > 0);

  if (trials.length === 0) {
    return (
      <div className="report-page">
        {header}
        <p className="report-empty-state">No dogs are on a waitlist for this show.</p>
      </div>
    );
  }

  return (
    <div className="report-page">
      {header}

      {trials.map(({ trial, classes }) => (
        <div key={trial.id} className="catalog-trial-section">
          <h2 className="catalog-trial-header">
            {formatTrialLabel({ name: trial.name ?? '', trialNumber: trial.trialNumber })}
            {trial.date ? ` — ${formatReportDate(trial.date)}` : ''}
          </h2>

          {classes.map(cls => (
            <div key={cls.id} className="catalog-class-section">
              <div className="catalog-class-header">
                {[cls.element, cls.level, cls.section].filter(Boolean).join(' ')}
              </div>
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Position</th>
                    <th>Call Name</th>
                    <th>Handler</th>
                  </tr>
                </thead>
                <tbody>
                  {[...(rowsByClass.get(cls.id) ?? [])]
                    .sort((a, b) => a.position - b.position)
                    .map(row => (
                      <tr key={row.id}>
                        <td>{row.position}</td>
                        <td>{row.callName}</td>
                        <td>{row.handler || '—'}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};
