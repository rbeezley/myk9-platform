import React from 'react';
import type { ReportProps } from '@/lib/reports/types';
import {
  formatReportDate,
  formatReportTime,
  sortByPlacement,
  sortByArmband,
  getPlacementText,
  getResultStatusText,
  isQualified,
  countQualified,
  getOrgTitle,
} from '@/lib/reports/reportUtils';

export const ResultsSheet: React.FC<ReportProps> = ({
  showName,
  trial,
  classData,
  entries,
  sortOrder,
  organization: _organization,
  activityType: _activityType,
}) => {
  const sortedEntries = sortOrder === 'armband' ? sortByArmband(entries) : sortByPlacement(entries);

  const qualifiedCount = countQualified(entries);
  const orgTitle = getOrgTitle(classData?.element);

  return (
    <div className="report-page">
      <div className="report-header">
        <span className="report-logo">myK9Show</span>
        <h1 className="report-title">{orgTitle} Preliminary Results</h1>
      </div>

      {showName && <p className="report-subtitle">{showName}</p>}

      {(trial || classData) && (
        <div className="trial-info-box">
          {trial?.date && (
            <div className="info-row">
              <span className="info-label">Trial Date:</span>
              <span className="info-value">{formatReportDate(trial.date)}</span>
            </div>
          )}
          {classData?.element && (
            <div className="info-row">
              <span className="info-label">Element:</span>
              <span className="info-value">{classData.element}</span>
            </div>
          )}
          {trial?.trialNumber && (
            <div className="info-row">
              <span className="info-label">Trial #:</span>
              <span className="info-value">{trial.trialNumber}</span>
            </div>
          )}
          {classData?.level && (
            <div className="info-row">
              <span className="info-label">Level:</span>
              <span className="info-value">{classData.level}</span>
            </div>
          )}
          {trial?.judgeName && (
            <div className="info-row">
              <span className="info-label">Judge:</span>
              <span className="info-value">{trial.judgeName}</span>
            </div>
          )}
          {classData?.section && classData.section.trim() !== '' && (
            <div className="info-row">
              <span className="info-label">Section:</span>
              <span className="info-value">{classData.section}</span>
            </div>
          )}
        </div>
      )}

      <table className="report-table">
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
          {sortedEntries.map(entry => {
            const qualified = isQualified(entry);
            const statusText = getResultStatusText(entry);
            return (
              <tr key={entry.id}>
                <td className="place-cell">{getPlacementText(entry)}</td>
                <td>{entry.armband}</td>
                <td>{entry.callName}</td>
                <td>{entry.breed}</td>
                <td>{entry.handler}</td>
                <td className={qualified ? 'qualified-text' : 'nq-text'}>{statusText}</td>
                <td className="faults-col">{entry.totalFaults ?? 0}</td>
                <td className="time-cell">{formatReportTime(entry.searchTimeSeconds)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="report-footer">
        <div className="footer-left">
          Class Entries: {entries.length}
          <span className="qualified-count">Qualified Entries: {qualifiedCount}</span>
        </div>
        <div className="footer-right">Page 1 of 1</div>
      </div>
    </div>
  );
};
