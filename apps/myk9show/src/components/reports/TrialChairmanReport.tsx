import React from 'react';
import type { ReportProps } from '@/lib/reports/types';
import { formatReportDate } from '@/lib/reports/reportUtils';

export const TrialChairmanReport: React.FC<ReportProps> = ({ showName, clubName, trial }) => {
  const trialDate = trial?.date ? formatReportDate(trial.date) : '___________';
  const judgeName = trial?.judgeName ?? '___________';

  return (
    <div className="report-page">
      <div className="report-header">
        <div className="report-logo">myK9Show</div>
        <h1 className="report-title">AKC Scent Work Trial Chair&apos;s Report</h1>
        <p style={{ fontSize: '9px', marginTop: '4px' }}>
          This form is to be completed by the club chair once all trials are complete. Submit to AKC
          Event Operations, 8051 Arco Corporate Dr, Suite 100, Raleigh, NC 27617-3390.
        </p>
      </div>

      <table className="form-table">
        <tbody>
          <tr>
            <td className="form-label">Trial Date(s):</td>
            <td className="form-value">{trialDate}</td>
            <td className="form-label">Trial Number:</td>
            <td className="form-value">Trial {trial?.trialNumber ?? '___'}</td>
          </tr>
          <tr>
            <td className="form-label">Club Name:</td>
            <td className="form-value" colSpan={3}>
              {clubName ?? showName ?? '___________'}
            </td>
          </tr>
          <tr>
            <td className="form-label">Chair Name:</td>
            <td className="form-value">___________________________</td>
            <td className="form-label">Telephone:</td>
            <td className="form-value">___________________________</td>
          </tr>
          <tr>
            <td className="form-label">Email:</td>
            <td className="form-value" colSpan={3}>
              ___________________________
            </td>
          </tr>
          <tr>
            <td className="form-label">Judge(s):</td>
            <td className="form-value" colSpan={3}>
              {judgeName}
            </td>
          </tr>
        </tbody>
      </table>

      <div className="form-section">
        <p className="form-question">
          <strong>Was the judge(s) knowledgeable?</strong>
        </p>
        <div className="form-checkbox-row">
          <span className="form-checkbox">☐ Yes</span>
          <span className="form-checkbox">☐ No</span>
          <span className="form-inline-label">If no, explain:</span>
        </div>
        <div className="form-blank-line" />
      </div>

      <div className="form-section">
        <p className="form-question">
          <strong>
            Did the club provide a non-entered, qualified Demo Dog for all classes? If the required
            Demo Dog was not utilized in protest, please explain why and what dog was used.
          </strong>
        </p>
        <div className="form-checkbox-row">
          <span className="form-checkbox">☐ Yes</span>
          <span className="form-checkbox">☐ No</span>
        </div>
        <div className="form-blank-lines">
          <div className="form-blank-line" />
          <div className="form-blank-line" />
        </div>
      </div>

      <div className="form-section">
        <p className="form-question">
          <strong>Were there any reportable Dog Aggression incidents at this event?</strong>
        </p>
        <div className="form-checkbox-row">
          <span className="form-checkbox">☐ Yes</span>
          <span className="form-checkbox">☐ No</span>
          <span className="form-inline-label">If yes, describe:</span>
        </div>
        <div className="form-blank-line" />
      </div>

      <div className="form-section">
        <p className="form-question">
          <strong>Were there any reportable Misconduct incidents at this event?</strong>
        </p>
        <div className="form-checkbox-row">
          <span className="form-checkbox">☐ Yes</span>
          <span className="form-checkbox">☐ No</span>
          <span className="form-inline-label">If yes, describe:</span>
        </div>
        <div className="form-blank-line" />
      </div>

      <div className="form-section">
        <p className="form-question">
          <strong>Were there any other problems at the trial site?</strong>
        </p>
        <div className="form-checkbox-row">
          <span className="form-checkbox">☐ Yes</span>
          <span className="form-checkbox">☐ No</span>
        </div>
        <div className="form-blank-lines">
          <div className="form-blank-line" />
          <div className="form-blank-line" />
        </div>
      </div>

      <div className="form-section">
        <p className="form-question">
          <strong>Comments:</strong>
        </p>
        <div className="form-blank-lines">
          <div className="form-blank-line" />
          <div className="form-blank-line" />
          <div className="form-blank-line" />
        </div>
      </div>

      <div className="form-signature-section">
        <div className="signature-line">
          <span className="signature-label">Chair&apos;s Signature:</span>
          <span className="signature-blank" />
        </div>
        <div className="signature-line">
          <span className="signature-label">Date:</span>
          <span className="signature-blank" />
        </div>
      </div>

      <div className="report-footer">
        <div className="footer-right">Generated by myK9Show — Page 1 of 1</div>
      </div>
    </div>
  );
};
