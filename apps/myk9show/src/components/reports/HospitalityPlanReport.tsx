import React from 'react';
import { formatTrialLabel } from '@myk9/core';
import type { ReportProps } from '@/lib/reports/types';
import { formatReportDate } from '@/lib/reports/reportUtils';
import { lunchRoleLabel } from '@/features/lunch-orders/lunchOrders';

// Print size: the shared report table is 8pt, too small for a sheet handed to a hospitality
// person, so this report sets its own 10pt+ sizes.
const BODY = { fontSize: '13.5px' } as const;
const HEAD = { fontSize: '13.5px' } as const;

function Header({ showName }: { showName?: string | undefined }) {
  return (
    <div className="report-header">
      <div className="report-logo">myK9Show</div>
      <h1 className="report-title">Hospitality plan</h1>
      {showName && <p className="report-subtitle">{showName}</p>}
    </div>
  );
}

/**
 * Per show day: who is working (headcount by role, with names), then lunch orders and dietary
 * notes. Planning paper for a hospitality person who is usually not logged in, so it carries the
 * whole answer on the sheet. MYK9-1695.
 */
export const HospitalityPlanReport: React.FC<ReportProps> = ({
  showName,
  allTrials = [],
  hospitalityPlan,
}) => {
  if (!hospitalityPlan || hospitalityPlan.isLoading) {
    return (
      <div className="report-page">
        <p>Loading the hospitality plan...</p>
      </div>
    );
  }
  if (hospitalityPlan.isError) {
    return (
      <div className="report-page">
        <p>The hospitality plan could not load. Check your connection and try again.</p>
      </div>
    );
  }

  const trials = [...allTrials].sort(
    (a, b) => a.date.localeCompare(b.date) || a.trialNumber.localeCompare(b.trialNumber)
  );
  const daysByTrial = new Map(hospitalityPlan.data.map(day => [day.trialId, day]));
  const pages = trials.flatMap(trial => {
    const day = daysByTrial.get(trial.id);
    return day ? [{ trial, day }] : [];
  });

  if (pages.length === 0) {
    return (
      <div className="report-page">
        <Header showName={showName} />
        <p>Add a trial day to the show to plan hospitality.</p>
      </div>
    );
  }

  return (
    <>
      {pages.map(({ trial, day }) => (
        <div key={trial.id} className="report-page" data-testid={`hospitality-day-${trial.id}`}>
          <Header showName={showName} />
          <h2 className="catalog-trial-header">
            {formatTrialLabel({ name: trial.name, trialNumber: trial.trialNumber })}
            {trial.date ? `, ${formatReportDate(trial.date)}` : ''}
          </h2>

          <h3 style={{ fontSize: '15px', margin: '12px 0 0' }}>
            Headcount: {day.total} {day.total === 1 ? 'person' : 'people'}
          </h3>
          {day.roles.length === 0 ? (
            <p style={BODY}>No one is assigned to this day yet.</p>
          ) : (
            <table className="report-table" style={BODY}>
              <thead>
                <tr>
                  <th style={{ ...HEAD, width: '110px' }}>Role</th>
                  <th style={{ ...HEAD, width: '50px' }}>Count</th>
                  <th style={HEAD}>Names</th>
                </tr>
              </thead>
              <tbody>
                {day.roles.map(group => (
                  <tr key={group.role}>
                    <td>{group.label}</td>
                    <td>{group.count}</td>
                    <td>{group.names.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td style={{ fontWeight: 'bold' }}>Total</td>
                  <td style={{ fontWeight: 'bold' }}>{day.total}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}

          <h3 style={{ fontSize: '15px', margin: '12px 0 0' }}>Lunch orders and dietary notes</h3>
          {day.orders.length === 0 ? (
            <p style={BODY}>No lunch orders yet.</p>
          ) : (
            <table className="report-table" style={BODY}>
              <thead>
                <tr>
                  <th style={HEAD}>Name</th>
                  <th style={{ ...HEAD, width: '90px' }}>Role</th>
                  <th style={HEAD}>Lunch order</th>
                  <th style={HEAD}>Dietary note</th>
                </tr>
              </thead>
              <tbody>
                {day.orders.map(item => (
                  <tr key={item.key}>
                    <td>{item.name}</td>
                    <td>{lunchRoleLabel(item.role)}</td>
                    <td>{item.lunchOrder}</td>
                    <td>{item.dietaryNote}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </>
  );
};
