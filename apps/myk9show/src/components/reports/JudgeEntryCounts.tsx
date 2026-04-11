import React from 'react';
import type { ReportProps } from '@/lib/reports/types';

function formatEstTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatHHMM(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export const JudgeEntryCounts: React.FC<ReportProps> = ({
  showName,
  organization,
  entries,
  allClasses,
  sortOrder,
  includeEstimatedTime,
}) => {
  const showTime = sortOrder === 'with-time' || includeEstimatedTime === true;

  const entriesByClassId = new Map<string, number>();
  for (const e of entries) {
    const key = e.classId ?? '';
    entriesByClassId.set(key, (entriesByClassId.get(key) ?? 0) + 1);
  }

  const judgeMap = new Map<string, typeof allClasses>();
  for (const cls of allClasses ?? []) {
    const judge = cls.judgeName ?? 'TBD';
    if (!judgeMap.has(judge)) judgeMap.set(judge, []);
    judgeMap.get(judge)!.push(cls);
  }

  const orgTitle = organization ? `${organization} ` : '';

  const judgeData = [...judgeMap.entries()].map(([judge, classes]) => {
    const rows = (classes ?? []).map(cls => {
      const count = entriesByClassId.get(cls.id) ?? 0;
      return { cls, count, estSeconds: count * 45 };
    });
    const judgeTotal = rows.reduce((s, r) => s + r.count, 0);
    const judgeTimeSeconds = rows.reduce((s, r) => s + r.estSeconds, 0);
    return { judge, rows, judgeTotal, judgeTimeSeconds };
  });

  const grandTotal = judgeData.reduce((s, d) => s + d.judgeTotal, 0);
  const grandTimeSeconds = judgeData.reduce((s, d) => s + d.judgeTimeSeconds, 0);

  return (
    <div className="report-page">
      <div className="report-header">
        <div className="report-logo">myK9Show</div>
        <h1 className="report-title">Judge Entry Counts</h1>
        {showName && <p className="report-subtitle">{orgTitle}{showName}</p>}
      </div>

      {judgeData.map(({ judge, rows, judgeTotal, judgeTimeSeconds }) => {
        return (
          <div key={judge} className="stats-section">
            <div className="stats-section-header">{judge}</div>
            <table className="report-table">
              <thead>
                <tr>
                  <th>Element</th>
                  <th>Level</th>
                  <th>Section</th>
                  <th>Entries</th>
                  {showTime && <th>Est. Time</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ cls, count, estSeconds }) => (
                  <tr key={cls.id}>
                    <td>{cls.element}</td>
                    <td>{cls.level}</td>
                    <td>{cls.section ?? ''}</td>
                    <td>{count}</td>
                    {showTime && <td>{formatEstTime(estSeconds)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="stats-element-total">
              {judge}: {judgeTotal} entries{showTime ? ` — estimated ${formatHHMM(judgeTimeSeconds)}` : ''}
            </div>
          </div>
        );
      })}

      <div className="stats-footer">
        Grand Total: {grandTotal} entries{showTime ? ` — estimated ${formatHHMM(grandTimeSeconds)}` : ''}
      </div>
    </div>
  );
};
