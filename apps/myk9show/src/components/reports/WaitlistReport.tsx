import React from 'react';
import type { ReportProps, ReportEntry } from '@/lib/reports/types';
import { formatReportDate } from '@/lib/reports/reportUtils';

export const WaitlistReport: React.FC<ReportProps> = ({ showName, organization, entries }) => {
  const waitlisted = entries.filter(e => e.paymentStatus === 'waitlisted');
  const orgTitle = organization ? `${organization} Scent Work` : 'Scent Work';

  const header = (
    <div className="report-header">
      <div className="report-logo">myK9Show</div>
      <h1 className="report-title">{orgTitle} Waitlist</h1>
      {showName && <p className="report-subtitle">{showName}</p>}
    </div>
  );

  if (waitlisted.length === 0) {
    return (
      <div className="report-page">
        {header}
        <p className="report-empty-state">No waitlisted entries.</p>
      </div>
    );
  }

  const trialMap = new Map<string, { trialNumber: string; trialDate: string; classes: Map<string, { element: string; level: string; entries: ReportEntry[] }> }>();
  for (const entry of waitlisted) {
    const trialKey = entry.trialId ?? 'unknown';
    if (!trialMap.has(trialKey)) {
      trialMap.set(trialKey, {
        trialNumber: entry.trialNumber ?? '',
        trialDate: entry.trialDate ?? '',
        classes: new Map(),
      });
    }
    const trial = trialMap.get(trialKey)!;
    const classKey = entry.classId ?? 'unknown';
    if (!trial.classes.has(classKey)) {
      trial.classes.set(classKey, {
        element: entry.classElement ?? '',
        level: entry.classLevel ?? '',
        entries: [],
      });
    }
    trial.classes.get(classKey)!.entries.push(entry);
  }

  return (
    <div className="report-page">
      {header}

      {[...trialMap.entries()].map(([trialId, trial]) => (
        <div key={trialId} className="catalog-trial-section">
          <h2 className="catalog-trial-header">
            Trial {trial.trialNumber}
            {trial.trialDate ? ` — ${formatReportDate(trial.trialDate)}` : ''}
          </h2>

          {[...trial.classes.entries()].map(([classId, cls]) => (
            <div key={classId} className="catalog-class-section">
              <div className="catalog-class-header">
                {[cls.element, cls.level].filter(Boolean).join(' ')}
              </div>
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Armband</th>
                    <th>Call Name</th>
                    <th>Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {cls.entries.map(entry => (
                    <tr key={entry.id}>
                      <td>{entry.armband}</td>
                      <td>{entry.callName}</td>
                      <td>{entry.handler}</td>
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
