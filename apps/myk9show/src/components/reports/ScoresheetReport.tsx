import React from 'react';
import type { ReportProps } from '@/lib/reports/types';
import {
  formatReportDate,
  sortByRunOrder,
  sortByArmband,
  getOrgTitle,
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
  <span
    className={small ? 'time-box-sm' : 'time-box'}
    style={{
      display: 'inline-flex',
      flexDirection: 'column',
      alignItems: 'center',
      marginRight: small ? 4 : 6,
    }}
  >
    <span
      style={{
        display: 'inline-block',
        width: small ? 28 : 32,
        height: small ? 16 : 20,
        border: '1px solid #000',
        background: '#fff',
      }}
    />
    <span style={{ fontSize: 8, marginTop: 1 }}>{label}</span>
  </span>
);

interface ReasonChecklistProps {
  label: string;
  reasons: string[];
}

const ReasonChecklist: React.FC<ReasonChecklistProps> = ({ label, reasons }) => (
  <div style={{ marginBottom: 4 }}>
    <div style={{ fontWeight: 600, fontSize: 9, marginBottom: 2 }}>{label}</div>
    {reasons.map(reason => (
      <div key={reason} style={{ display: 'flex', alignItems: 'center', gap: 3, marginBottom: 1 }}>
        <span className="checkbox-square" style={{ width: 10, height: 10, flexShrink: 0 }} />
        <span style={{ fontSize: 9 }}>{reason}</span>
      </div>
    ))}
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

  const orgTitle =
    organization && activityType
      ? `${organization} ${activityType}`
      : organization
        ? `${organization} ${classData?.element ?? ''}`
        : getOrgTitle(classData?.element);

  const areaCount = classData?.areaCount ?? 1;

  const timeLimit1 = formatTimeLimit(classData?.timeLimitSeconds);
  const timeLimit2 = formatTimeLimit(classData?.timeLimitArea2Seconds);
  const timeLimit3 = formatTimeLimit(classData?.timeLimitArea3Seconds);

  const hidesText = classData?.hidesText ?? '';
  const distractionsText = classData?.distractionsText ?? '';

  return (
    <div className="report-page">
      {/* Scoresheet Header */}
      <div className="scoresheet-header">
        {/* Row 1: branding + title + entry count */}
        <div
          className="header-top"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 8,
          }}
        >
          <div
            className="report-logo"
            style={{ fontSize: 14, fontWeight: 'bold', color: '#14b8a6' }}
          >
            myK9Show
          </div>
          <div style={{ textAlign: 'center' }}>
            <h1 className="report-title" style={{ fontSize: 18, margin: 0 }}>
              {orgTitle} Scoresheet
            </h1>
            {showName && (
              <p className="report-subtitle" style={{ fontSize: 12, margin: '2px 0 0 0' }}>
                {showName}
              </p>
            )}
          </div>
          <div style={{ fontSize: 11, textAlign: 'right' }}>Entries: {sortedEntries.length}</div>
        </div>

        {/* Row 2: 4-column info grid */}
        <div
          className="header-columns"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr 1fr',
            gap: 8,
            borderTop: '1px solid #ccc',
            paddingTop: 8,
            fontSize: 11,
            textAlign: 'left',
          }}
        >
          {/* Col 1: Trial date / number / judge */}
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

          {/* Col 2: Element / level / section */}
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
            {classData?.section && classData.section !== '-' && classData.section.trim() !== '' && (
              <div className="info-row">
                <span className="info-label">Section: </span>
                <span className="info-value">{classData.section}</span>
              </div>
            )}
          </div>

          {/* Col 3: Requirements — hides / distractions */}
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

          {/* Col 4: Time limits */}
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
            {/* Col 1: Entry info */}
            <div className="scoresheet-entry-info entry-info">
              <div style={{ fontSize: 18, fontWeight: 'bold', lineHeight: 1 }}>{entry.armband}</div>
              <div style={{ marginTop: 2 }}>{entry.callName}</div>
              {entry.registrationNumber && (
                <div style={{ fontSize: 9, color: '#555' }}>{entry.registrationNumber}</div>
              )}
              {entry.breed && <div style={{ fontSize: 9 }}>{entry.breed}</div>}
              {entry.handler && <div style={{ fontSize: 9 }}>{entry.handler}</div>}
            </div>

            {/* Col 2: Results — Q/Absent + handler notes */}
            <div className="scoresheet-entry-results entry-results">
              <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 4 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10 }}>
                  <span className="checkbox-square" style={{ width: 12, height: 12 }} />Q
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10 }}>
                  <span className="checkbox-square" style={{ width: 12, height: 12 }} />
                  Absent
                </label>
              </div>
              <div style={{ fontSize: 9, textAlign: 'left' }}>
                {['Handler Error', 'Safety Concern', 'Mild Disruption'].map(field => (
                  <div
                    key={field}
                    style={{ display: 'flex', alignItems: 'center', gap: 3, marginBottom: 1 }}
                  >
                    <span className="checkbox-square" style={{ width: 10, height: 10 }} />
                    <span>{field}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Col 3: NQ / EX reasons */}
            <div className="scoresheet-entry-reasons entry-reasons">
              <ReasonChecklist label="NQ Reasons" reasons={NQ_REASONS} />
              <ReasonChecklist label="EX Reasons" reasons={EX_REASONS} />
            </div>

            {/* Col 4: Time boxes */}
            <div className="scoresheet-entry-time entry-time">
              {areaCount === 1 ? (
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                  <TimeBox label="MM" />
                  <TimeBox label="SS" />
                  <TimeBox label="TT" />
                </div>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    alignItems: 'flex-end',
                  }}
                >
                  {(['A1', 'A2', 'A3'] as const).slice(0, areaCount).map(areaLabel => (
                    <div key={areaLabel} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span className="area-label" style={{ fontSize: 9, width: 16 }}>
                        {areaLabel}
                      </span>
                      <TimeBox label="MM" small />
                      <TimeBox label="SS" small />
                      <TimeBox label="TT" small />
                    </div>
                  ))}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span className="area-label" style={{ fontSize: 9, width: 16 }}>
                      Total
                    </span>
                    <TimeBox label="MM" small />
                    <TimeBox label="SS" small />
                    <TimeBox label="TT" small />
                  </div>
                </div>
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
