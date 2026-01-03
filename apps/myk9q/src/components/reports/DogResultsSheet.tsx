import React from 'react';
import {
  formatReportDate,
  formatReportTime
} from './reportUtils';

export interface DogResultEntry {
  id: number;
  trialDate: string;
  trialNumber: number;
  className: string;
  element: string;
  level: string;
  section?: string;
  judgeName: string;
  searchTime: string | null;
  faultCount: number | null;
  placement: number | null;
  resultText: string | null;
  isScored: boolean;
  checkInStatus?: string;
}

export interface DogResultsSheetProps {
  dogInfo: {
    callName: string;
    breed: string;
    handler: string;
    armband: number;
  };
  results: DogResultEntry[];
  showName?: string;
  organization?: string;
}

export const DogResultsSheet: React.FC<DogResultsSheetProps> = ({ dogInfo, results, showName, organization: _organization }) => {
  // Sort by trial date (oldest first), trial number, element, then level
  const sortedResults = [...results].sort((a, b) => {
    // 1. Trial date (oldest first)
    const dateCompare = new Date(a.trialDate).getTime() - new Date(b.trialDate).getTime();
    if (dateCompare !== 0) return dateCompare;

    // 2. Trial number (ascending)
    if (a.trialNumber !== b.trialNumber) return a.trialNumber - b.trialNumber;

    // 3. Element (alphabetical)
    const elementCompare = a.element.localeCompare(b.element);
    if (elementCompare !== 0) return elementCompare;

    // 4. Level (alphabetical)
    return a.level.localeCompare(b.level);
  });

  // Calculate statistics
  const scoredResults = sortedResults.filter(r => r.isScored);
  const qualifiedCount = scoredResults.filter(r => {
    const resultText = r.resultText?.toLowerCase() || '';
    return resultText.includes('qual') && !resultText.includes('not');
  }).length;

  const qualificationRate = scoredResults.length > 0
    ? ((qualifiedCount / scoredResults.length) * 100).toFixed(1)
    : '0.0';

  const qualifiedTimes = scoredResults
    .filter(r => {
      const resultText = r.resultText?.toLowerCase() || '';
      return r.searchTime && resultText.includes('qual') && !resultText.includes('not');
    })
    .map(r => parseFloat(r.searchTime!))
    .filter(time => !isNaN(time));

  const fastestTime = qualifiedTimes.length > 0 ? Math.min(...qualifiedTimes).toFixed(2) : '--';
  const averageTime = qualifiedTimes.length > 0
    ? (qualifiedTimes.reduce((a, b) => a + b, 0) / qualifiedTimes.length).toFixed(2)
    : '--';

  const getPlacementText = (placement: number | null): string => {
    if (!placement || placement === 9996 || placement === 9999) return '--';
    return placement.toString();
  };

  const getCheckInStatusLabel = (status?: string): string => {
    if (!status || status === 'no-status') return 'No Status';
    switch (status) {
      case 'checked-in': return 'Checked In';
      case 'at-gate': return 'At Gate';
      case 'conflict': return 'Conflict';
      case 'pulled': return 'Pulled';
      default: return 'No Status';
    }
  };

  return (
    <div className="print-report dog-results-sheet">
      {/* Header */}
      <div className="print-header">
        <div className="print-logo">
          <img src="/myK9Q-teal-192.png" alt="myK9Q Logo" className="logo-img" />
          <span className="logo-text">myK9Q</span>
        </div>
        <h1 className="print-title">Dog Performance Report</h1>
        <div className="show-id">Armband #{dogInfo.armband}</div>
      </div>

      {/* Show Name (if available) */}
      {showName && (
        <div className="show-name">{showName}</div>
      )}

      {/* Dog Info Box */}
      <div className="trial-info-box">
        <div className="info-row">
          <span className="info-label">Call Name:</span>
          <span className="info-value">{dogInfo.callName}</span>
        </div>
        <div className="info-row">
          <span className="info-label">Armband:</span>
          <span className="info-value">#{dogInfo.armband}</span>
        </div>
        <div className="info-row">
          <span className="info-label">Breed:</span>
          <span className="info-value">{dogInfo.breed}</span>
        </div>
        <div className="info-row">
          <span className="info-label">Handler:</span>
          <span className="info-value">{dogInfo.handler}</span>
        </div>
      </div>

      {/* Statistics Summary */}
      <div className="trial-info-box" style={{ marginTop: '1rem' }}>
        <div className="info-row">
          <span className="info-label">Total Classes:</span>
          <span className="info-value">{results.length}</span>
        </div>
        <div className="info-row">
          <span className="info-label">Scored:</span>
          <span className="info-value">{scoredResults.length}</span>
        </div>
        <div className="info-row">
          <span className="info-label">Qualified:</span>
          <span className="info-value">{qualifiedCount}</span>
        </div>
        <div className="info-row">
          <span className="info-label">Q Rate:</span>
          <span className="info-value">{qualificationRate}%</span>
        </div>
        <div className="info-row">
          <span className="info-label">Fastest Time:</span>
          <span className="info-value">{fastestTime}s</span>
        </div>
        <div className="info-row">
          <span className="info-label">Average Time:</span>
          <span className="info-value">{averageTime}s</span>
        </div>
      </div>

      {/* Results Table */}
      <table className="print-table results-table with-margin">
        <thead>
          <tr>
            <th>Date</th>
            <th>Trial</th>
            <th>Class</th>
            <th>Judge</th>
            <th>Time</th>
            <th>Faults</th>
            <th>Place</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {sortedResults.map((result) => {
            const qualified = result.isScored && result.resultText?.toLowerCase().includes('qual') && !result.resultText?.toLowerCase().includes('not');
            const resultText = result.isScored
              ? (qualified ? 'Qualified' : 'NQ')
              : getCheckInStatusLabel(result.checkInStatus);

            // Determine cell class - make "Pulled" red like NQ
            const statusClass = result.isScored
              ? (qualified ? 'qualified-text' : 'nq-text')
              : (result.checkInStatus === 'pulled' ? 'nq-text' : '');

            return (
              <tr key={result.id} className={result.isScored ? (qualified ? 'qualified-row' : 'nq-row') : 'unscored-row'}>
                <td>{formatReportDate(result.trialDate)}</td>
                <td>T{result.trialNumber}</td>
                <td>{result.className}</td>
                <td>{result.judgeName || 'TBD'}</td>
                <td className="time-cell">{result.isScored ? formatReportTime(result.searchTime) : '--'}</td>
                <td>{result.isScored ? (result.faultCount ?? 0) : '--'}</td>
                <td className="place-cell">{result.isScored ? getPlacementText(result.placement) : '--'}</td>
                <td className={statusClass}>
                  {resultText}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Footer */}
      <div className="print-footer">
        <div className="footer-left">
          Total Classes: {results.length}
          <span className="qualified-count"> Qualified: {qualifiedCount} ({qualificationRate}%)</span>
        </div>
        <div className="footer-right">
          Generated: {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </div>
      </div>
    </div>
  );
};
