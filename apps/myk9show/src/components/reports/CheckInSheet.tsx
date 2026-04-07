import React from 'react';
import type { ReportProps } from '@/lib/reports/types';
import { sortByRunOrder, sortByArmband, buildReportOrgTitle } from '@/lib/reports/reportUtils';
import { TrialInfoBox } from './TrialInfoBox';

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

  const orgTitle = buildReportOrgTitle(organization, activityType, classData?.element);

  return (
    <div className="report-page">
      <div className="report-header">
        <div className="report-logo">myK9Show</div>
        <h1 className="report-title">{orgTitle} Check-in</h1>
        {showName && <p className="report-subtitle">{showName}</p>}
      </div>

      <TrialInfoBox trial={trial} classData={classData} />

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
