/**
 * Print report templates for the secretary pipeline.
 * Render as static HTML — no Tailwind, no app context.
 * Adapted from myK9Q's CheckInSheet, ResultsSheet, and ScoresheetReport.
 */

import React from 'react';
import type { PrintClassInfo, PrintReportEntry } from './print-types';
import {
  formatReportDate,
  formatReportTime,
  formatTimeLimit,
  sortByRunOrder,
  sortByPlacement,
  getPlacementText,
  getResultStatusText,
  isQualified,
  countQualified,
} from './print-utils';

interface TemplateProps {
  classInfo: PrintClassInfo;
  entries: PrintReportEntry[];
}

const InfoBox: React.FC<{ classInfo: PrintClassInfo }> = ({ classInfo }) => (
  <div className="trial-info-box">
    <div className="info-row">
      <span className="info-label">Trial Date:</span>
      <span className="info-value">{formatReportDate(classInfo.trialDate)}</span>
    </div>
    {classInfo.element && (
      <div className="info-row">
        <span className="info-label">Element:</span>
        <span className="info-value">{classInfo.element}</span>
      </div>
    )}
    <div className="info-row">
      <span className="info-label">Trial #:</span>
      <span className="info-value">{classInfo.trialNumber}</span>
    </div>
    {classInfo.level && (
      <div className="info-row">
        <span className="info-label">Level:</span>
        <span className="info-value">{classInfo.level}</span>
      </div>
    )}
    <div className="info-row">
      <span className="info-label">Judge:</span>
      <span className="info-value">{classInfo.judgeName ?? 'TBD'}</span>
    </div>
    {classInfo.section && (
      <div className="info-row">
        <span className="info-label">Section:</span>
        <span className="info-value">{classInfo.section}</span>
      </div>
    )}
    {classInfo.timeLimitSeconds != null && (
      <div className="info-row">
        <span className="info-label">Time Limit:</span>
        <span className="info-value">{formatTimeLimit(classInfo.timeLimitSeconds)}</span>
      </div>
    )}
  </div>
);

const PrintHeader: React.FC<{ title: string; showName?: string }> = ({ title, showName }) => (
  <>
    <div className="print-header">
      <div className="print-logo">
        <span className="logo-text">myK9Show</span>
      </div>
      <h1 className="print-title">{title}</h1>
    </div>
    {showName && <div className="show-name">{showName}</div>}
  </>
);

/* ------------------------------------------------------------------ */
/*  Run Order / Check-In Sheet                                         */
/* ------------------------------------------------------------------ */

export const RunOrderSheet: React.FC<TemplateProps> = ({ classInfo, entries }) => {
  const sorted = sortByRunOrder(entries);
  return (
    <div className="print-report">
      <PrintHeader title="Check-In / Run Order" showName={classInfo.showName} />
      <InfoBox classInfo={classInfo} />
      <table className="print-table with-margin">
        <thead>
          <tr>
            <th>Gate</th>
            <th>Armband</th>
            <th>Call Name</th>
            <th>Breed</th>
            <th>Handler</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(entry => (
            <tr key={entry.id}>
              <td className="checkbox-cell">
                <div className="checkbox-square" />
              </td>
              <td>{entry.armband}</td>
              <td>{entry.callName}</td>
              <td>{entry.breed}</td>
              <td>{entry.handlerName}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="print-footer">
        <div>Class Entries: {sorted.length}</div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Results Report                                                     */
/* ------------------------------------------------------------------ */

export const ResultsReport: React.FC<TemplateProps> = ({ classInfo, entries }) => {
  const scored = entries.filter(e => e.isScored);
  const sorted = sortByPlacement(scored);
  const qCount = countQualified(sorted);

  return (
    <div className="print-report">
      <PrintHeader title="Preliminary Results" showName={classInfo.showName} />
      <InfoBox classInfo={classInfo} />
      <table className="print-table with-margin">
        <thead>
          <tr>
            <th>Place</th>
            <th>Armband</th>
            <th>Call Name</th>
            <th>Breed</th>
            <th>Handler</th>
            <th>Qualified</th>
            <th>Faults</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(entry => {
            const q = isQualified(entry.resultText);
            return (
              <tr key={entry.id}>
                <td className="place-cell">{getPlacementText(entry.placement)}</td>
                <td>{entry.armband}</td>
                <td>{entry.callName}</td>
                <td>{entry.breed}</td>
                <td>{entry.handlerName}</td>
                <td className={q ? 'qualified-text' : 'nq-text'}>
                  {getResultStatusText(entry.resultText)}
                </td>
                <td>{entry.faultCount ?? 0}</td>
                <td className="time-cell">{formatReportTime(entry.searchTimeSeconds)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="print-footer">
        <div>
          Class Entries: {sorted.length}
          <span className="qualified-count">Qualified: {qCount}</span>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Blank Score Sheet (for judges)                                     */
/* ------------------------------------------------------------------ */

const SingleTimeRow = () => (
  <>
    <div className="time-box">
      <span className="time-label">MM</span>
    </div>
    <div className="time-box">
      <span className="time-label">SS</span>
    </div>
    <div className="time-box">
      <span className="time-label">TT</span>
    </div>
  </>
);

const SmallTimeRow: React.FC<{ label: string; isTotal?: boolean }> = ({ label, isTotal }) => (
  <div className={`time-row ${isTotal ? 'time-row-total' : ''}`}>
    <span className="area-label">{label}</span>
    <div className="time-box-sm">
      <span className="time-label">MM</span>
    </div>
    <div className="time-box-sm">
      <span className="time-label">SS</span>
    </div>
    <div className="time-box-sm">
      <span className="time-label">TT</span>
    </div>
  </div>
);

const TimeBoxes: React.FC<{ areaCount: number }> = ({ areaCount }) => {
  if (areaCount <= 1) {
    return (
      <div className="entry-time">
        <SingleTimeRow />
      </div>
    );
  }

  return (
    <div className="entry-time multi-area">
      {Array.from({ length: areaCount }, (_, i) => (
        <SmallTimeRow key={i} label={`A${i + 1}`} />
      ))}
      <SmallTimeRow label="Tot" isTotal />
    </div>
  );
};

const NQReasons: React.FC = () => (
  <div className="entry-reasons">
    <div className="reasons-group">
      <span className="reasons-label">NQ:</span>
      <div className="reasons-list">
        {[
          'Incorrect Call',
          'Max Time',
          'Point to Hide',
          'Harsh Correction',
          'Significant Disruption',
        ].map(r => (
          <div key={r} className="reason-item">
            <div className="checkbox-square" />
            <span>{r}</span>
          </div>
        ))}
      </div>
    </div>
    <div className="reasons-group">
      <span className="reasons-label">EX:</span>
      <div className="reasons-list">
        {[
          'Eliminated in Area',
          'Handler Request',
          'Out of Control',
          'Overly Stressed',
          'Other',
        ].map(r => (
          <div key={r} className="reason-item">
            <div className="checkbox-square" />
            <span>{r}</span>
          </div>
        ))}
      </div>
    </div>
  </div>
);

export const BlankScoreSheet: React.FC<TemplateProps> = ({ classInfo, entries }) => {
  const sorted = sortByRunOrder(entries);
  const areaCount = classInfo.areaCount ?? 1;
  const timeLimit = formatTimeLimit(classInfo.timeLimitSeconds);

  return (
    <div className="print-report scoresheet-report">
      <table className="scoresheet-table">
        <thead>
          <tr>
            <th colSpan={4}>
              <div className="scoresheet-header">
                <div className="header-top">
                  <div className="header-logo">
                    <span className="logo-text-sm">myK9Show</span>
                  </div>
                  <div className="header-title">Scoresheet</div>
                  <div className="header-entries">Entries: {sorted.length}</div>
                </div>
                <div className="header-columns">
                  <div className="header-col">
                    <div>
                      <strong>Trial Date:</strong> {formatReportDate(classInfo.trialDate)}
                    </div>
                    <div>
                      <strong>Trial #:</strong> {classInfo.trialNumber}
                    </div>
                    <div>
                      <strong>Judge:</strong> {classInfo.judgeName ?? 'TBD'}
                    </div>
                  </div>
                  <div className="header-col">
                    {classInfo.element && (
                      <div>
                        <strong>Element:</strong> {classInfo.element}
                      </div>
                    )}
                    {classInfo.level && (
                      <div>
                        <strong>Level:</strong> {classInfo.level}
                        {classInfo.section ? ` • ${classInfo.section}` : ''}
                      </div>
                    )}
                  </div>
                  <div className="header-col">
                    <div>
                      <strong>Req:</strong> Hides: ___ • Distractions: ___
                    </div>
                  </div>
                  <div className="header-col">
                    <div>
                      <strong>Used:</strong> Hides: ___
                    </div>
                    <div>
                      <strong>Time:</strong> A1: {timeLimit || '___'}
                    </div>
                  </div>
                </div>
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={4}>
              <div className="scoresheet-entries">
                {sorted.map(entry => (
                  <div key={entry.id} className="scoresheet-entry-row">
                    {/* Dog info */}
                    <div className="entry-info">
                      <div className="entry-armband">{entry.armband}</div>
                      <div className="entry-details">
                        <div className="entry-callname">{entry.callName}</div>
                        <div className="entry-breed">{entry.breed}</div>
                        <div className="entry-handler">{entry.handlerName}</div>
                      </div>
                    </div>

                    {/* Results column */}
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
                        {['Handler Error:', 'Safety Concern:', 'Mild Disruption:'].map(label => (
                          <div key={label} className="field-row">
                            <span className="field-label">{label}</span>
                            <span className="field-line" />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* NQ/EX reasons */}
                    <NQReasons />

                    {/* Time boxes */}
                    <TimeBoxes areaCount={areaCount} />
                  </div>
                ))}
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};
