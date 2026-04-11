import React from 'react';
import type { ReportProps } from '@/lib/reports/types';

export const ShowEntryCounts: React.FC<ReportProps> = ({
  showName,
  organization,
  showDates,
  entries,
}) => {
  // Group entries by element → (level, section)
  const elementMap = new Map<string, Map<string, number>>();
  for (const entry of entries) {
    const element = entry.classElement ?? 'Unknown';
    const key =
      [entry.classLevel ?? '', entry.classSection ?? ''].filter(Boolean).join(' / ') || 'General';
    if (!elementMap.has(element)) elementMap.set(element, new Map());
    const classMap = elementMap.get(element)!;
    classMap.set(key, (classMap.get(key) ?? 0) + 1);
  }

  const uniquePeople = new Set(entries.map(e => e.handler)).size;
  const uniqueDogs = new Set(entries.map(e => e.callName)).size;
  const orgTitle = organization ? `${organization} Scent Work` : 'Scent Work';

  return (
    <div className="report-page">
      <div className="report-header">
        <div className="report-logo">myK9Show</div>
        <h1 className="report-title">{orgTitle} Entry Counts</h1>
        {showName && <p className="report-subtitle">{showName}</p>}
        {showDates && <p className="report-subtitle">{showDates}</p>}
        <p className="report-subtitle">Entry Counts by Show</p>
      </div>

      {[...elementMap.entries()].map(([element, classMap]) => {
        const elementTotal = [...classMap.values()].reduce((s, n) => s + n, 0);
        return (
          <div key={element} className="stats-section">
            <div className="stats-section-header">{element}</div>
            <table className="report-table">
              <thead>
                <tr>
                  <th>Level / Section</th>
                  <th>Entries</th>
                </tr>
              </thead>
              <tbody>
                {[...classMap.entries()].map(([classKey, count]) => (
                  <tr key={classKey}>
                    <td>{classKey}</td>
                    <td>{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="stats-element-total">
              {element} Element Total: {elementTotal}
            </div>
          </div>
        );
      })}

      <div className="stats-footer">
        Show Entry Total: {entries.length} &nbsp;&nbsp; People: {uniquePeople} &nbsp;&nbsp; Dogs:{' '}
        {uniqueDogs}
      </div>
    </div>
  );
};
