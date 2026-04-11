import React from 'react';
import type { ReportProps, ReportEntry } from '@/lib/reports/types';
import { sortByPlacement, sortByArmband, formatReportTime } from '@/lib/reports/reportUtils';

const NQ_SENTINEL = 9000;

function getSortedEntries(entries: ReportEntry[], sortOrder: string): ReportEntry[] {
  return sortOrder === 'armband' ? sortByArmband(entries) : sortByPlacement(entries);
}

function formatPlacement(entry: ReportEntry): string | null {
  if (!entry.isScored || entry.finalPlacement === null || entry.finalPlacement >= NQ_SENTINEL) {
    return null;
  }
  return String(entry.finalPlacement);
}

interface LabelProps {
  entry: ReportEntry;
  showName: string;
  trialNumber: string | undefined;
  element: string | undefined;
  level: string | undefined;
}

const ResultLabel: React.FC<LabelProps> = ({ entry, showName, trialNumber, element, level }) => {
  const placement = formatPlacement(entry);
  const timeStr = formatReportTime(entry.searchTimeSeconds);
  const classLine = [element, level].filter(Boolean).join(' ');
  const trialClassLine = [trialNumber ? `Trial ${trialNumber}` : null, classLine]
    .filter(Boolean)
    .join(' — ');

  const showResultLine =
    entry.isScored &&
    (placement !== null || timeStr !== '' || entry.totalFaults !== null);

  return (
    <div className="result-label">
      <div className="result-label-armband">{entry.armband}</div>
      <div className="result-label-callname">{entry.callName}</div>
      <div className="result-label-handler">{entry.handler}</div>
      <div className="result-label-show">{showName}</div>
      {trialClassLine && (
        <div className="result-label-trial-class">{trialClassLine}</div>
      )}
      {showResultLine && (
        <div className="result-label-results">
          {placement !== null && <span>Place: {placement}</span>}
          {timeStr !== '' && <span>Time: {timeStr}</span>}
          {entry.totalFaults !== null && <span>Faults: {entry.totalFaults}</span>}
        </div>
      )}
    </div>
  );
};

export const ResultLabels: React.FC<ReportProps> = ({
  showName,
  trial,
  classData,
  entries,
  sortOrder,
}) => {
  const sortedEntries = getSortedEntries(entries, sortOrder);

  return (
    <div className="report-page">
      <div className="report-header">
        <div className="report-logo">myK9Show</div>
        <h1 className="report-title">Result Labels</h1>
        {showName && <p className="report-subtitle">{showName}</p>}
      </div>

      <div className="result-labels-grid">
        {sortedEntries.map(entry => (
          <ResultLabel
            key={entry.id}
            entry={entry}
            showName={showName}
            trialNumber={trial?.trialNumber}
            element={classData?.element}
            level={classData?.level}
          />
        ))}
      </div>
    </div>
  );
};
