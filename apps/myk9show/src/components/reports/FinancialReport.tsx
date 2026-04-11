import React from 'react';
import type { ReportProps } from '@/lib/reports/types';
import { formatFee } from '@/utils/format';

export const FinancialReport: React.FC<ReportProps> = ({
  showName,
  organization,
  showDates,
  entries,
  sortOrder,
}) => {
  const filterStatus = sortOrder === 'waitlist' ? 'waitlisted' : 'accepted';
  const filtered = entries.filter(e => e.paymentStatus === filterStatus);

  const orgTitle = organization ? `${organization} Scent Work` : 'Scent Work';
  const variantLabel = filterStatus === 'accepted' ? 'Accepted Entries' : 'Waitlisted Entries';

  const exhibitorMap = new Map<string, typeof filtered>();
  for (const entry of filtered) {
    const handler = entry.handler || 'Unknown';
    if (!exhibitorMap.has(handler)) exhibitorMap.set(handler, []);
    exhibitorMap.get(handler)!.push(entry);
  }

  const grandTotal = filtered.reduce((sum, e) => sum + (e.entryFee ?? 0), 0);

  const header = (
    <div className="report-header">
      <div className="report-logo">myK9Show</div>
      <h1 className="report-title">{orgTitle} Financial Report</h1>
      {showName && <p className="report-subtitle">{showName}</p>}
      {showDates && <p className="report-subtitle">{showDates}</p>}
      <p className="report-subtitle">{variantLabel}</p>
    </div>
  );

  if (filtered.length === 0) {
    return (
      <div className="report-page">
        {header}
        <p className="report-empty-state">No entries match the selected filter.</p>
      </div>
    );
  }

  return (
    <div className="report-page">
      {header}

      {[...exhibitorMap.entries()].map(([handler, exhibitorEntries]) => {
        const subtotal = exhibitorEntries.reduce((sum, e) => sum + (e.entryFee ?? 0), 0);
        return (
          <div key={handler} className="catalog-exhibitor-group">
            <div className="catalog-exhibitor-header">{handler}</div>
            <table className="report-table">
              <thead>
                <tr>
                  <th>Dog</th>
                  <th>Armband</th>
                  <th>Payment Method</th>
                  <th>Fee</th>
                </tr>
              </thead>
              <tbody>
                {exhibitorEntries.map(entry => (
                  <tr key={entry.id}>
                    <td>{entry.callName}</td>
                    <td>{entry.armband}</td>
                    <td>{entry.paymentMethod ?? '—'}</td>
                    <td>{entry.entryFee != null ? formatFee(entry.entryFee) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="catalog-exhibitor-subtotal">
              {handler} Subtotal: {formatFee(subtotal)}
            </div>
          </div>
        );
      })}

      <div className="report-grand-total">Grand Total: {formatFee(grandTotal)}</div>
    </div>
  );
};
