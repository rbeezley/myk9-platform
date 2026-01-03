import React from 'react';
import { Entry } from '../../stores/entryStore';
import {
  formatReportDate,
  formatReportTime,
  sortByPlacement,
  getPlacementText,
  getResultStatusText,
  isQualified,
  countQualified,
  getOrgTitle,
  generateShowIdentifier
} from './reportUtils';

export interface ResultsSheetProps {
  classInfo: {
    className: string;
    element: string;
    level: string;
    section: string;
    trialDate: string;
    trialNumber: string;
    judgeName: string;
    timeLimit?: string;
    showName?: string;
    organization?: string;
    activityType?: string;
  };
  entries: Entry[];
}

export const ResultsSheet: React.FC<ResultsSheetProps> = ({ classInfo, entries }) => {
  const sortedEntries = sortByPlacement(entries);
  const qualifiedCount = countQualified(sortedEntries);
  // Build title: "AKC Scent Work Preliminary Results" or fallback to element-based title
  const orgTitle = classInfo.organization && classInfo.activityType
    ? `${classInfo.organization} ${classInfo.activityType}`
    : classInfo.organization
    ? `${classInfo.organization} ${classInfo.element}`
    : getOrgTitle(classInfo.element);
  const showId = generateShowIdentifier(classInfo.trialDate, classInfo.trialNumber);

  return (
    <div className="print-report results-sheet">
      {/* Header */}
      <div className="print-header">
        <div className="print-logo">
          <img src="/myK9Q-teal-192.png" alt="myK9Q Logo" className="logo-img" />
          <span className="logo-text">myK9Q</span>
        </div>
        <h1 className="print-title">{orgTitle} Preliminary Results</h1>
        <div className="show-id">{showId}</div>
      </div>

      {/* Show Name (if available) */}
      {classInfo.showName && (
        <div className="show-name">{classInfo.showName}</div>
      )}

      {/* Trial Info Box */}
      <div className="trial-info-box">
        <div className="info-row">
          <span className="info-label">Trial Date:</span>
          <span className="info-value">{formatReportDate(classInfo.trialDate)}</span>
        </div>
        <div className="info-row">
          <span className="info-label">Element:</span>
          <span className="info-value">{classInfo.element}</span>
        </div>
        {classInfo.timeLimit && (
          <div className="info-row">
            <span className="info-label">Max Time 1:</span>
            <span className="info-value">{classInfo.timeLimit}</span>
          </div>
        )}
        <div className="info-row">
          <span className="info-label">Trial #:</span>
          <span className="info-value">{classInfo.trialNumber}</span>
        </div>
        <div className="info-row">
          <span className="info-label">Level:</span>
          <span className="info-value">{classInfo.level}</span>
        </div>
        <div className="info-row">
          <span className="info-label">Judge:</span>
          <span className="info-value">{classInfo.judgeName || 'TBD'}</span>
        </div>
        {classInfo.section && classInfo.section !== '-' && classInfo.section.trim() !== '' && (
          <div className="info-row">
            <span className="info-label">Section:</span>
            <span className="info-value">{classInfo.section}</span>
          </div>
        )}
      </div>

      {/* Results Table */}
      <table className="print-table results-table with-margin">
        <thead>
          <tr>
            <th className="place-col">Place</th>
            <th className="armband-col">Armband</th>
            <th className="callname-col">Call Name</th>
            <th className="breed-col">Breed</th>
            <th className="handler-col">Handler</th>
            <th className="qualified-col">Qualified</th>
            <th className="faults-col">Faults</th>
            <th className="time-col">Time</th>
          </tr>
        </thead>
        <tbody>
          {sortedEntries.map((entry) => {
            const qualified = isQualified(entry);
            const resultText = getResultStatusText(entry);
            const placementDisplay = getPlacementText(entry);

            return (
              <tr key={entry.id} className={qualified ? 'qualified-row' : 'nq-row'}>
                <td className="place-cell">{placementDisplay}</td>
                <td className="armband-cell">{entry.armband}</td>
                <td className="callname-cell">{entry.callName}</td>
                <td className="breed-cell">{entry.breed}</td>
                <td className="handler-cell">{entry.handler}</td>
                <td className={`qualified-cell ${qualified ? 'qualified-text' : 'nq-text'}`}>
                  {resultText}
                </td>
                <td className="faults-cell">{entry.faultCount ?? 0}</td>
                <td className="time-cell">{formatReportTime(entry.searchTime)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Footer */}
      <div className="print-footer">
        <div className="footer-left">
          Class Entries: {sortedEntries.length}
          <span className="qualified-count"> Qualified Entries: {qualifiedCount}</span>
        </div>
        <div className="footer-right">
          Page 1 of 1
        </div>
      </div>
    </div>
  );
};
