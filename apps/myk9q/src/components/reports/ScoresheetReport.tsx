import React from 'react';
import { Entry } from '../../stores/entryStore';
import { formatReportDate, sortByRunOrder, getOrgTitle } from './reportUtils';

export interface ScoresheetReportProps {
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
    // Time limits (optional - from ClassEntry)
    timeLimitSeconds?: number;
    timeLimitArea2Seconds?: number;
    timeLimitArea3Seconds?: number;
    areaCount?: number;
    // Class requirements from database (pre-filled for Novice/Advanced/Excellent, blank for Master)
    hidesText?: string;        // e.g., "1", "2", "3" - blank for Master
    distractionsText?: string; // e.g., "None", "Non-food" - blank for Master
  };
  entries: Entry[];
}

/**
 * Format time limit from seconds to MM:SS display
 */
function formatTimeLimit(seconds: number | undefined): string {
  if (!seconds) return '';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}:${String(secs).padStart(2, '0')}` : `${mins} min`;
}

/**
 * Printable Scoresheet for Judges
 *
 * Generates a paper scoresheet that judges can print and use
 * to record scores during a trial. Required for 1-year retention.
 *
 * Layout based on standard AKC Scent Work scoresheet format.
 */
export const ScoresheetReport: React.FC<ScoresheetReportProps> = ({ classInfo, entries }) => {
  const sortedEntries = sortByRunOrder(entries);

  // Build title
  const orgTitle = classInfo.organization && classInfo.activityType
    ? `${classInfo.organization} ${classInfo.activityType}`
    : classInfo.organization
    ? `${classInfo.organization} ${classInfo.element}`
    : getOrgTitle(classInfo.element);

  // Time limits
  const timeLimit1 = formatTimeLimit(classInfo.timeLimitSeconds);
  const timeLimit2 = formatTimeLimit(classInfo.timeLimitArea2Seconds);
  const timeLimit3 = formatTimeLimit(classInfo.timeLimitArea3Seconds);
  const areaCount = classInfo.areaCount || 1;

  // Build section display
  const sectionDisplay = classInfo.section && classInfo.section !== '-' && classInfo.section.trim() !== ''
    ? ` • ${classInfo.section}`
    : '';

  return (
    <div className="print-report scoresheet-report">
      {/* Table structure for repeating header on every page */}
      <table className="scoresheet-table">
        <thead>
          <tr>
            <th colSpan={4}>
              {/* Compact Header */}
              <div className="scoresheet-header">
                <div className="header-top">
                  <div className="header-logo">
                    <img src="/myK9Q-teal-192.png" alt="myK9Q Logo" className="logo-img-sm" />
                    <span className="logo-text-sm">myK9Q</span>
                  </div>
                  <div className="header-title">{orgTitle} Scoresheet</div>
                  <div className="header-entries">Entries: {sortedEntries.length}</div>
                </div>
                <div className="header-columns">
                  <div className="header-col">
                    <div><strong>Trial Date:</strong> {formatReportDate(classInfo.trialDate)}</div>
                    <div><strong>Trial #:</strong> {classInfo.trialNumber}</div>
                    <div><strong>Judge:</strong> {classInfo.judgeName || 'TBD'}</div>
                  </div>
                  <div className="header-col">
                    <div><strong>Element:</strong> {classInfo.element}</div>
                    <div><strong>Level:</strong> {classInfo.level}{sectionDisplay}</div>
                  </div>
                  <div className="header-col">
                    <div><strong>Req:</strong> Hides: {classInfo.hidesText || '___'} • Distractions: {classInfo.distractionsText || '___'}</div>
                  </div>
                  <div className="header-col">
                    <div><strong>Used:</strong> Hides: ___</div>
                    <div><strong>Time:</strong> A1: {timeLimit1 || '___'}{areaCount >= 2 ? ` • A2: ${timeLimit2 || '___'}` : ''}{areaCount >= 3 ? ` • A3: ${timeLimit3 || '___'}` : ''}</div>
                  </div>
                </div>
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
      {/* Entry Rows */}
      <tr><td colSpan={4}>
      <div className="scoresheet-entries">
        {sortedEntries.map((entry) => (
          <div key={entry.id} className="scoresheet-entry-row">
            {/* Dog Info Column */}
            <div className="entry-info">
              <div className="entry-armband">{entry.armband}</div>
              <div className="entry-details">
                <div className="entry-callname">{entry.callName}</div>
                <div className="entry-reg">{entry.id ? `WS${entry.id}` : ''}</div>
                <div className="entry-breed">{entry.breed}</div>
                <div className="entry-handler">{entry.handler}</div>
              </div>
            </div>

            {/* Results Column */}
            <div className="entry-results">
              <div className="results-row">
                <div className="result-item result-qualified">
                  <div className="checkbox-square"></div>
                  <span>Q</span>
                </div>
                <div className="result-item">
                  <div className="checkbox-square"></div>
                  <span>Absent</span>
                </div>
              </div>
              <div className="scoring-fields">
                <div className="field-row">
                  <span className="field-label">Handler Error:</span>
                  <span className="field-line"></span>
                </div>
                <div className="field-row">
                  <span className="field-label">Safety Concern:</span>
                  <span className="field-line"></span>
                </div>
                <div className="field-row">
                  <span className="field-label">Mild Disruption:</span>
                  <span className="field-line"></span>
                </div>
              </div>
            </div>

            {/* Reasons Column */}
            <div className="entry-reasons">
              <div className="reasons-group">
                <span className="reasons-label">NQ:</span>
                <div className="reasons-list">
                  <div className="reason-item">
                    <div className="checkbox-square"></div>
                    <span>Incorrect Call</span>
                  </div>
                  <div className="reason-item">
                    <div className="checkbox-square"></div>
                    <span>Max Time</span>
                  </div>
                  <div className="reason-item">
                    <div className="checkbox-square"></div>
                    <span>Point to Hide</span>
                  </div>
                  <div className="reason-item">
                    <div className="checkbox-square"></div>
                    <span>Harsh Correction</span>
                  </div>
                  <div className="reason-item">
                    <div className="checkbox-square"></div>
                    <span>Significant Disruption</span>
                  </div>
                </div>
              </div>
              <div className="reasons-group">
                <span className="reasons-label">EX:</span>
                <div className="reasons-list">
                  <div className="reason-item">
                    <div className="checkbox-square"></div>
                    <span>Eliminated in Area</span>
                  </div>
                  <div className="reason-item">
                    <div className="checkbox-square"></div>
                    <span>Handler Request</span>
                  </div>
                  <div className="reason-item">
                    <div className="checkbox-square"></div>
                    <span>Out of Control</span>
                  </div>
                  <div className="reason-item">
                    <div className="checkbox-square"></div>
                    <span>Overly Stressed</span>
                  </div>
                  <div className="reason-item">
                    <div className="checkbox-square"></div>
                    <span>Other</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Time Entry Column - adaptive based on area count */}
            <div className={`entry-time ${areaCount > 1 ? 'multi-area' : ''}`}>
              {areaCount === 1 ? (
                // Single area: horizontal MM:SS:TT
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
              ) : (
                // Multi-area: stacked rows with area labels
                <>
                  <div className="time-row">
                    <span className="area-label">A1</span>
                    <div className="time-box-sm"><span className="time-label">MM</span></div>
                    <div className="time-box-sm"><span className="time-label">SS</span></div>
                    <div className="time-box-sm"><span className="time-label">TT</span></div>
                  </div>
                  <div className="time-row">
                    <span className="area-label">A2</span>
                    <div className="time-box-sm"><span className="time-label">MM</span></div>
                    <div className="time-box-sm"><span className="time-label">SS</span></div>
                    <div className="time-box-sm"><span className="time-label">TT</span></div>
                  </div>
                  {areaCount >= 3 && (
                    <div className="time-row">
                      <span className="area-label">A3</span>
                      <div className="time-box-sm"><span className="time-label">MM</span></div>
                      <div className="time-box-sm"><span className="time-label">SS</span></div>
                      <div className="time-box-sm"><span className="time-label">TT</span></div>
                    </div>
                  )}
                  <div className="time-row time-row-total">
                    <span className="area-label">Tot</span>
                    <div className="time-box-sm"><span className="time-label">MM</span></div>
                    <div className="time-box-sm"><span className="time-label">SS</span></div>
                    <div className="time-box-sm"><span className="time-label">TT</span></div>
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      </td></tr>
        </tbody>
      </table>
    </div>
  );
};
