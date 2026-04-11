import React from 'react';
import type { ReportProps } from '@/lib/reports/types';
import { formatReportDate } from '@/lib/reports/reportUtils';

export const AKCJudgeReport: React.FC<ReportProps> = ({ showName, clubName, trial, allClasses = [] }) => {
  const trialDate = trial?.date ? formatReportDate(trial.date) : '___________';
  const judgeName = trial?.judgeName ?? '___________';
  const trialNumber = trial?.trialNumber ?? '___';

  // Collect elements judged by this judge
  const judgedElements = [
    ...new Set(
      allClasses
        .filter(c => !c.judgeName || c.judgeName === trial?.judgeName)
        .map(c => `${c.element} ${c.level}`.trim())
    ),
  ];

  return (
    <div className="report-page">
      <div className="report-header">
        <div className="report-logo">myK9Show</div>
        <h1 className="report-title">AKC Scent Work Trial Judge&apos;s Report</h1>
        <p style={{ fontSize: '9px', marginTop: '4px' }}>
          This form is to be completed by the AKC Scent Work judge after his/her assignment is
          complete. Only one form should be submitted for all trials judged by the same judge.
          Submit to address or email below.
        </p>
      </div>

      <table className="form-table">
        <tbody>
          <tr>
            <td className="form-label">This report is for:</td>
            <td className="form-value">
              <span style={{ marginRight: '16px' }}>☐ Trial</span>
              <span>☐ Match</span>
            </td>
            <td className="form-label">Event Number(s):</td>
            <td className="form-value">Trial {trialNumber}</td>
          </tr>
          <tr>
            <td className="form-label">Event Date(s):</td>
            <td className="form-value">{trialDate}</td>
            <td className="form-label">Judging Assignment:</td>
            <td className="form-value">___________________________</td>
          </tr>
          <tr>
            <td className="form-label">Club Name:</td>
            <td className="form-value" colSpan={3}>
              {clubName ?? showName ?? '___________'}
            </td>
          </tr>
          <tr>
            <td className="form-label">Name and Judge #:</td>
            <td className="form-value" colSpan={3}>
              {judgeName}
            </td>
          </tr>
          <tr>
            <td className="form-label">Your Email Address:</td>
            <td className="form-value" colSpan={3}>
              ___________________________
            </td>
          </tr>
        </tbody>
      </table>

      {judgedElements.length > 0 && (
        <div className="form-section">
          <span className="form-label">Classes Judged:</span>{' '}
          <span className="form-value">{judgedElements.join(', ')}</span>
        </div>
      )}

      <div className="form-section">
        <p className="form-question">
          <strong>Were there any reportable problems at the show site?</strong>
        </p>
        <div className="form-checkbox-row">
          <span className="form-checkbox">☐ Yes</span>
          <span className="form-checkbox">☐ No</span>
          <span className="form-inline-label">Comments:</span>
        </div>
        <div className="form-blank-line" />
        <div className="form-blank-line" />
      </div>

      <div className="form-section">
        <p className="form-question">
          <strong>Was the site adequate for the classes being offered?</strong>
        </p>
        <div className="form-checkbox-row">
          <span className="form-checkbox">☐ Yes</span>
          <span className="form-checkbox">☐ No</span>
          <span className="form-inline-label">Comments:</span>
        </div>
        <div className="form-blank-line" />
        <div className="form-blank-line" />
      </div>

      <div className="form-section">
        <p className="form-question">
          <strong>
            Did the club provide a non-entered, qualified Demo Dog for all of your classes? If the
            required Demo Dog was not utilized as planned, please explain why an entered dog was
            used.
          </strong>
        </p>
        <div className="form-checkbox-row">
          <span className="form-checkbox">☐ Yes</span>
          <span className="form-checkbox">☐ No</span>
        </div>
        <div className="form-blank-line" />
        <div className="form-blank-line" />
      </div>

      <div className="form-section">
        <p className="form-question">
          <strong>
            Did the club provide you with adequate information about the site 90 days prior to trial
            to help you plan your searches?
          </strong>
        </p>
        <div className="form-checkbox-row">
          <span className="form-checkbox">☐ Yes</span>
          <span className="form-checkbox">☐ No</span>
        </div>
        <div className="form-blank-line" />
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
          <strong>
            Were there any problems with the site that would prevent you from judging there again?
          </strong>
        </p>
        <div className="form-checkbox-row">
          <span className="form-checkbox">☐ Yes</span>
          <span className="form-checkbox">☐ No</span>
          <span className="form-inline-label">If yes, explain:</span>
        </div>
        <div className="form-blank-line" />
        <div className="form-blank-line" />
      </div>

      <div className="form-section">
        <p className="form-question">
          <strong>Comments / Suggestions:</strong>
        </p>
        <div className="form-blank-line" />
        <div className="form-blank-line" />
        <div className="form-blank-line" />
      </div>

      <div className="form-signature-section">
        <div className="signature-line">
          <span className="signature-label">Judge&apos;s Signature:</span>
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
