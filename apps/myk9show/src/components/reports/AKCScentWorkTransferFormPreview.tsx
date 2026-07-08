import React from 'react';
import type { ReportEntry, ReportProps } from '@/lib/reports/types';
import { formatReportDate } from '@/lib/reports/reportUtils';

function formatClassName(classData: ReportProps['classData']): string {
  return [classData?.element, classData?.level, classData?.section]
    .filter(Boolean)
    .join(' ')
    .trim();
}

function selectEntry(entries: ReportEntry[], dogId: string | undefined): ReportEntry | undefined {
  if (!dogId) return entries[0];
  return entries.find(entry => entry.dogId === dogId) ?? entries[0];
}

export const AKCScentWorkTransferFormPreview: React.FC<ReportProps> = ({
  showName,
  clubName,
  trial,
  classData,
  dogId,
  entries,
}) => {
  const entry = selectEntry(entries, dogId);
  const trialDate = trial?.date ? formatReportDate(trial.date) : '___________';
  const classFrom = formatClassName(classData) || '___________';

  return (
    <div className="report-page">
      <div className="report-header">
        <div className="report-logo">AKC</div>
        <h1 className="report-title">Scent Work Class Transfer Form</h1>
        <p className="report-subtitle">{clubName ?? showName}</p>
      </div>

      <table className="form-table">
        <tbody>
          <tr>
            <td className="form-label">Club:</td>
            <td className="form-value">{clubName ?? showName}</td>
            <td className="form-label">Date:</td>
            <td className="form-value">{trialDate}</td>
          </tr>
          <tr>
            <td className="form-label">Dog:</td>
            <td className="form-value">{entry?.callName ?? '___________'}</td>
            <td className="form-label">Armband:</td>
            <td className="form-value">{entry?.armband ?? '___'}</td>
          </tr>
          <tr>
            <td className="form-label">Breed:</td>
            <td className="form-value">{entry?.breed ?? '___________'}</td>
            <td className="form-label">AKC Number:</td>
            <td className="form-value">{entry?.registrationNumber ?? '___________'}</td>
          </tr>
          <tr>
            <td className="form-label">Class From:</td>
            <td className="form-value" colSpan={3}>
              {classFrom}
            </td>
          </tr>
          <tr>
            <td className="form-label">Class To:</td>
            <td className="form-value" colSpan={3}>
              ______________________________
            </td>
          </tr>
        </tbody>
      </table>

      <div className="form-signature-section">
        <div className="signature-line">
          <span className="signature-label">Owner or authorized agent:</span>
          <span className="signature-blank" />
        </div>
        <div className="signature-line">
          <span className="signature-label">Trial Secretary:</span>
          <span className="signature-blank" />
        </div>
      </div>
    </div>
  );
};
