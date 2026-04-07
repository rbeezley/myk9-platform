import React from 'react';
import type { ReportProps } from '@/lib/reports/types';
import {
  formatReportDate,
  sortByRunOrder,
  sortByArmband,
  buildReportOrgTitle,
  isValidSection,
  formatTimeLimit,
} from '@/lib/reports/reportUtils';

const NQ_REASONS = [
  'Incorrect Call',
  'Max Time',
  'Point to Hide',
  'Harsh Correction',
  'Significant Disruption',
];

const EX_REASONS = [
  'Eliminated in Area',
  'Handler Request',
  'Out of Control',
  'Overly Stressed',
  'Other',
];

interface TimeBoxProps {
  label: string;
  small?: boolean;
}

const TimeBox: React.FC<TimeBoxProps> = ({ label, small }) => (
  <div className={small ? 'time-box-sm' : 'time-box'}>
    <span className="time-label">{label}</span>
  </div>
);

interface ReasonChecklistProps {
  label: string;
  reasons: string[];
}

const ReasonChecklist: React.FC<ReasonChecklistProps> = ({ label, reasons }) => (
  <div className="reasons-group">
    <span className="reasons-label">{label}</span>
    <div className="reasons-list">
      {reasons.map(reason => (
        <div key={reason} className="reason-item">
          <div className="checkbox-square" />
          <span>{reason}</span>
        </div>
      ))}
    </div>
  </div>
);

export const ScoresheetReport: React.FC<ReportProps> = ({
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

  const areaCount = classData?.areaCount ?? 1;

  const timeLimit1 = formatTimeLimit(classData?.timeLimitSeconds);
  const timeLimit2 = formatTimeLimit(classData?.timeLimitArea2Seconds);
  const timeLimit3 = formatTimeLimit(classData?.timeLimitArea3Seconds);

  const hidesText = classData?.hidesText ?? '';
  const distractionsText = classData?.distractionsText ?? '';

  return (
    <div className="report-page">
      <div className="scoresheet-header">
        <div
          className="header-top"
        >
          <div className="report-logo">myK9Show</div>
          <div>
            <h1 className="report-title">{orgTitle} Scoresheet</h1>
            {showName && <p className="report-subtitle">{showName}</p>}
          </div>
          <div className="header-entries">Entries: {sortedEntries.length}</div>
        </div>

        <div className="header-columns">
          <div>
            {trial?.date && (
              <div className="info-row">
                <span className="info-label">Date: </span>
                <span className="info-value">{formatReportDate(trial.date)}</span>
              </div>
            )}
            {trial?.trialNumber && (
              <div className="info-row">
                <span className="info-label">Trial #: </span>
                <span className="info-value">{trial.trialNumber}</span>
              </div>
            )}
            {trial?.judgeName && (
              <div className="info-row">
                <span className="info-label">Judge: </span>
                <span className="info-value">{trial.judgeName}</span>
              </div>
            )}
          </div>

          <div>
            {classData?.element && (
              <div className="info-row">
                <span className="info-label">Element: </span>
                <span className="info-value">{classData.element}</span>
              </div>
            )}
            {classData?.level && (
              <div className="info-row">
                <span className="info-label">Level: </span>
                <span className="info-value">{classData.level}</span>
              </div>
            )}
            {isValidSection(classData?.section) && (
              <div className="info-row">
                <span className="info-label">Section: </span>
                <span className="info-value">{classData?.section}</span>
              </div>
            )}
          </div>

          <div>
            {hidesText && (
              <div className="info-row">
                <span className="info-label">Hides: </span>
                <span className="info-value">{hidesText}</span>
              </div>
            )}
            {distractionsText && (
              <div className="info-row">
                <span className="info-label">Distractions: </span>
                <span className="info-value">{distractionsText}</span>
              </div>
            )}
          </div>

          <div>
            {timeLimit1 && areaCount === 1 && (
              <div className="info-row">
                <span className="info-label">Time Limit: </span>
                <span className="info-value">{timeLimit1}</span>
              </div>
            )}
            {areaCount > 1 && (
              <>
                {timeLimit1 && (
                  <div className="info-row">
                    <span className="info-label">Area 1: </span>
                    <span className="info-value">{timeLimit1}</span>
                  </div>
                )}
                {timeLimit2 && (
                  <div className="info-row">
                    <span className="info-label">Area 2: </span>
                    <span className="info-value">{timeLimit2}</span>
                  </div>
                )}
                {timeLimit3 && (
                  <div className="info-row">
                    <span className="info-label">Area 3: </span>
                    <span className="info-value">{timeLimit3}</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Scoresheet Entries */}
      <div className="scoresheet-entries">
        {sortedEntries.map(entry => (
          <div key={entry.id} className="scoresheet-entry-row">
            <div className="entry-info">
              <div className="entry-armband">{entry.armband}</div>
              <div className="entry-details">
                <div className="entry-callname">{entry.callName}</div>
                {entry.registrationNumber && (
                  <div className="entry-reg">{entry.registrationNumber}</div>
                )}
                {entry.breed && <div className="entry-breed">{entry.breed}</div>}
                {entry.handler && <div className="entry-handler">{entry.handler}</div>}
              </div>
            </div>

            <div className="entry-results">
              <div className="results-row">
                <div className="result-item">
                  <div className="checkbox-square" />
                  <span>Q</span>
                </div>
                <div className="result-item">
                  <div className="checkbox-square" />
                  <span>Absent</span>
                </div>
              </div>
              <div className="scoring-fields">
                {['Handler Error', 'Safety Concern', 'Mild Disruption'].map(field => (
                  <div key={field} className="field-row">
                    <span className="field-label">{field}:</span>
                    <span className="field-line" />
                  </div>
                ))}
              </div>
            </div>

            <div className="scoresheet-entry-reasons entry-reasons">
              <ReasonChecklist label="NQ Reasons" reasons={NQ_REASONS} />
              <ReasonChecklist label="EX Reasons" reasons={EX_REASONS} />
            </div>

            <div className={`entry-time ${areaCount > 1 ? 'multi-area' : ''}`}>
              {areaCount === 1 ? (
                <>
                  <TimeBox label="MM" />
                  <TimeBox label="SS" />
                  <TimeBox label="TT" />
                </>
              ) : (
                <>
                  {(['A1', 'A2', 'A3'] as const).slice(0, areaCount).map(areaLabel => (
                    <div key={areaLabel} className="time-row">
                      <span className="area-label">{areaLabel}</span>
                      <TimeBox label="MM" small />
                      <TimeBox label="SS" small />
                      <TimeBox label="TT" small />
                    </div>
                  ))}
                  <div className="time-row time-row-total">
                    <span className="area-label">Total</span>
                    <TimeBox label="MM" small />
                    <TimeBox label="SS" small />
                    <TimeBox label="TT" small />
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="report-footer">
        <div className="footer-left">
          {orgTitle} Scoresheet &mdash; {sortedEntries.length} entries
        </div>
        <div className="footer-right">Generated by myK9Show</div>
      </div>
    </div>
  );
};
