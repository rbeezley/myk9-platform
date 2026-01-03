import React from 'react';
import { Entry } from '../../stores/entryStore';
import { formatReportDate, sortByRunOrder, getOrgTitle } from './reportUtils';

export interface CheckInSheetProps {
  classInfo: {
    className: string;
    element: string;
    level: string;
    section: string;
    trialDate: string;
    trialNumber: string;
    judgeName: string;
    organization?: string;
    activityType?: string;
  };
  entries: Entry[];
}

export const CheckInSheet: React.FC<CheckInSheetProps> = ({ classInfo, entries }) => {
  const sortedEntries = sortByRunOrder(entries);
  // Build title: "AKC Scent Work Check-in" or fallback to element-based title
  const orgTitle = classInfo.organization && classInfo.activityType
    ? `${classInfo.organization} ${classInfo.activityType}`
    : classInfo.organization
    ? `${classInfo.organization} ${classInfo.element}`
    : getOrgTitle(classInfo.element);

  return (
    <div className="print-report check-in-sheet">
      {/* Header */}
      <div className="print-header">
        <div className="print-logo">
          <img src="/myK9Q-teal-192.png" alt="myK9Q Logo" className="logo-img" />
          <span className="logo-text">myK9Q</span>
        </div>
        <h1 className="print-title">{orgTitle} Check-in</h1>
      </div>

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

      {/* Entry Table */}
      <table className="print-table with-margin">
        <thead>
          <tr>
            <th className="checkbox-col">Gate</th>
            <th className="checkbox-col">myK9Q</th>
            <th className="armband-col">Armband</th>
            <th className="callname-col">Call Name</th>
            <th className="breed-col">Breed</th>
            <th className="akc-col">AKC #</th>
            <th className="handler-col">Handler Name</th>
          </tr>
        </thead>
        <tbody>
          {sortedEntries.map((entry) => (
            <tr key={entry.id}>
              {/* Gate column - always empty checkbox for manual marking */}
              <td className="checkbox-cell">
                <div className="checkbox-square"></div>
              </td>
              {/* myK9Q column - shows check mark if checked in via myK9Q app */}
              <td className="checkbox-cell">
                <div className={`checkbox-square ${entry.checkedIn ? 'checked' : ''}`}>
                  {entry.checkedIn && <span className="checkmark">✓</span>}
                </div>
              </td>
              <td className="armband-cell">{entry.armband}</td>
              <td className="callname-cell">{entry.callName}</td>
              <td className="breed-cell">{entry.breed}</td>
              <td className="akc-cell">{entry.id ? `WS${entry.id}` : ''}</td>
              <td className="handler-cell">{entry.handler}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Footer */}
      <div className="print-footer">
        <div className="footer-left">
          Class Entries: {sortedEntries.length}
        </div>
        <div className="footer-right">
          Page 1 of 1
        </div>
      </div>
    </div>
  );
};
