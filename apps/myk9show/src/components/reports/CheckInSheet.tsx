import React from 'react';
import type { ReportProps } from '@/lib/reports/types';
import {
  formatReportDate,
  sortByRunOrder,
  sortByArmband,
  getOrgTitle,
} from '@/lib/reports/reportUtils';

export const CheckInSheet: React.FC<ReportProps> = ({
  showName,
  trial,
  classData,
  entries,
  sortOrder,
  organization,
  activityType,
}) => {
  const sortedEntries = sortOrder === 'armband' ? sortByArmband(entries) : sortByRunOrder(entries);

  const orgTitle =
    organization && activityType
      ? `${organization} ${activityType}`
      : organization
        ? `${organization} ${classData?.element ?? ''}`
        : getOrgTitle(classData?.element);

  return (
    <div className="report-page">
      <div className="report-header">
        <div className="report-logo">myK9Show</div>
        <h1 className="report-title">{orgTitle} Check-in</h1>
        {showName && <p className="report-subtitle">{showName}</p>}
      </div>

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
          {classData?.section && classData.section !== '-' && classData.section.trim() !== '' && (
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
            <th className="checkbox-col">Gate</th>
            <th className="armband-col">Armband</th>
            <th className="callname-col">Call Name</th>
            <th className="breed-col">Breed</th>
            <th className="akc-col">Reg #</th>
            <th className="handler-col">Handler</th>
          </tr>
        </thead>
        <tbody>
          {sortedEntries.map(entry => (
            <tr key={entry.id}>
              <td className="checkbox-cell">
                <div className="checkbox-square"></div>
              </td>
              <td>{entry.armband}</td>
              <td>{entry.callName}</td>
              <td>{entry.breed}</td>
              <td>{entry.registrationNumber ?? ''}</td>
              <td>{entry.handler}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="report-footer">
        <div className="footer-left">Class Entries: {sortedEntries.length}</div>
        <div className="footer-right">Page 1 of 1</div>
      </div>
    </div>
  );
};
