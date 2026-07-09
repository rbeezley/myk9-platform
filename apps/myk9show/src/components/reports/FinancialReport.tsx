import React from 'react';
import type { ReportProps } from '@/lib/reports/types';
import { formatFee } from '@/utils/format';
import { formatArmbandDisplay } from '@/utils/armbandUtils';
import {
  calculateFinancialReportTotals,
  type FinancialReportBucket,
  type FinancialReportLine,
} from './financialReportTotals';

export const FinancialReport: React.FC<ReportProps> = ({
  showName,
  organization,
  showDates,
  entries,
  sortOrder,
}) => {
  const mode = sortOrder === 'waitlist' ? 'waitlist' : 'current';
  const totals = calculateFinancialReportTotals(entries, mode);

  const orgTitle = organization ? `${organization} Scent Work` : 'Scent Work';
  const variantLabel = mode === 'current' ? 'Current Entries' : 'Waitlisted Entries';

  const exhibitorMap = new Map<string, FinancialReportLine[]>();
  for (const line of totals.lines) {
    const handler = line.entry.handler || 'Unknown';
    if (!exhibitorMap.has(handler)) exhibitorMap.set(handler, []);
    exhibitorMap.get(handler)!.push(line);
  }

  const header = (
    <div className="report-header">
      <div className="report-logo">myK9Show</div>
      <h1 className="report-title">{orgTitle} Financial Report</h1>
      {showName && <p className="report-subtitle">{showName}</p>}
      {showDates && <p className="report-subtitle">{showDates}</p>}
      <p className="report-subtitle">{variantLabel}</p>
    </div>
  );

  if (totals.lines.length === 0) {
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

      <FinancialSummaryTable summary={totals.summary} />

      <BreakdownTable
        title="Payment Method Breakdown"
        rows={totals.paymentBreakdown}
        showOutstanding
      />

      {totals.trialBreakdown.length > 1 && (
        <BreakdownTable title="Trial Breakdown" rows={totals.trialBreakdown} showOutstanding />
      )}

      {[...exhibitorMap.entries()].map(([handler, exhibitorEntries]) => {
        const subtotal = exhibitorEntries.reduce((sum, line) => sum + line.netRetained, 0);
        return (
          <div key={handler} className="catalog-exhibitor-group">
            <div className="catalog-exhibitor-header">{handler}</div>
            <table className="report-table">
              <thead>
                <tr>
                  <th>Dog</th>
                  <th>Armband</th>
                  <th>Trial</th>
                  <th>Status</th>
                  <th>Method</th>
                  <th>Gross</th>
                  <th>Discount</th>
                  <th>Refund</th>
                  <th>Outstanding</th>
                  <th>Net</th>
                </tr>
              </thead>
              <tbody>
                {exhibitorEntries.map(line => (
                  <tr key={line.entry.id}>
                    <td>{line.entry.callName}</td>
                    <td>{formatArmbandDisplay(line.entry.armband)}</td>
                    <td>{line.entry.trialNumber ?? '—'}</td>
                    <td>{formatStatus(line.entry.paymentStatus)}</td>
                    <td>{line.paymentLabel}</td>
                    <td>{formatFee(line.gross)}</td>
                    <td>{line.discount > 0 ? formatFee(line.discount) : '—'}</td>
                    <td>{line.refunded > 0 ? formatFee(line.refunded) : '—'}</td>
                    <td>{line.outstanding > 0 ? formatFee(line.outstanding) : '—'}</td>
                    <td>{formatFee(line.netRetained)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="catalog-exhibitor-subtotal">
              {handler} Net Retained: {formatFee(subtotal)}
            </div>
          </div>
        );
      })}

      <div className="report-grand-total">
        Net Retained: {formatFee(totals.summary.netRetained)}
      </div>
    </div>
  );
};

function FinancialSummaryTable({ summary }: { summary: FinancialReportBucket }) {
  return (
    <table className="report-table">
      <thead>
        <tr>
          <th>Entries</th>
          <th>Gross Fees</th>
          <th>Discounts</th>
          <th>Waived/Comped</th>
          <th>Collected</th>
          <th>Refunded</th>
          <th>Outstanding</th>
          <th>Net Retained</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>{summary.count}</td>
          <td>{formatFee(summary.gross)}</td>
          <td>{formatFee(summary.discount)}</td>
          <td>{formatFee(summary.waived)}</td>
          <td>{formatFee(summary.collected)}</td>
          <td>{formatFee(summary.refunded)}</td>
          <td>{formatFee(summary.outstanding)}</td>
          <td>{formatFee(summary.netRetained)}</td>
        </tr>
      </tbody>
    </table>
  );
}

function BreakdownTable({
  title,
  rows,
  showOutstanding = false,
}: {
  title: string;
  rows: FinancialReportBucket[];
  showOutstanding?: boolean;
}) {
  if (rows.length === 0) return null;

  return (
    <div className="catalog-exhibitor-group">
      <div className="catalog-exhibitor-header">{title}</div>
      <table className="report-table">
        <thead>
          <tr>
            <th>Group</th>
            <th>Entries</th>
            <th>Gross</th>
            <th>Discount</th>
            <th>Waived</th>
            <th>Collected</th>
            <th>Refunded</th>
            {showOutstanding && <th>Outstanding</th>}
            <th>Net</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.label}>
              <td>{row.label}</td>
              <td>{row.count}</td>
              <td>{formatFee(row.gross)}</td>
              <td>{row.discount > 0 ? formatFee(row.discount) : '—'}</td>
              <td>{row.waived > 0 ? formatFee(row.waived) : '—'}</td>
              <td>{formatFee(row.collected)}</td>
              <td>{row.refunded > 0 ? formatFee(row.refunded) : '—'}</td>
              {showOutstanding && <td>{row.outstanding > 0 ? formatFee(row.outstanding) : '—'}</td>}
              <td>{formatFee(row.netRetained)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatStatus(status: string | null | undefined): string {
  if (!status) return 'Unknown';
  return status
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
