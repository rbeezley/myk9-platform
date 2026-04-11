import React from 'react';
import type { ReportProps } from '@/lib/reports/types';

export const BreedEntryCounts: React.FC<ReportProps> = ({
  showName,
  organization,
  showDates,
  entries,
}) => {
  const breedMap = new Map<string, number>();
  for (const entry of entries) {
    const breed = entry.breed || 'Unknown';
    breedMap.set(breed, (breedMap.get(breed) ?? 0) + 1);
  }

  const sortedBreeds = [...breedMap.entries()].sort(([a], [b]) => a.localeCompare(b));
  const totalBreeds = sortedBreeds.length;
  const totalEntries = entries.length;
  const orgTitle = organization ? `${organization} Scent Work Breed Counts` : 'Scent Work Breed Counts';

  return (
    <div className="report-page">
      <div className="report-header">
        <div className="report-logo">myK9Show</div>
        <h1 className="report-title">{orgTitle}</h1>
        {showName && <p className="report-subtitle">{showName}</p>}
        {showDates && <p className="report-subtitle">{showDates}</p>}
      </div>

      <table className="report-table">
        <thead>
          <tr>
            <th>Breed</th>
            <th>Entries</th>
          </tr>
        </thead>
        <tbody>
          {sortedBreeds.map(([breed, count]) => (
            <tr key={breed}>
              <td>{breed}</td>
              <td>{count}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="stats-footer">
        Total Breeds: {totalBreeds} &nbsp;&nbsp; Total Entries: {totalEntries}
      </div>
    </div>
  );
};
