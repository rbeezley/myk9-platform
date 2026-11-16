import React from 'react';
import { NATIONALS_SCORING } from '@myk9/core';
import type { AreaScore } from '../../../types';

/**
 * The per-area read-back on the Nationals Score Confirmation. The judge copies it onto the
 * paper sheet, so its lines must add up to Total Points: the finish call deduction has its
 * own line, and a run whose lines sum below zero says it scores 0 (MYK9-1835).
 */
export const NationalsAreaBreakdown: React.FC<{
  areas: AreaScore[];
  correctAlerts: number[];
  incorrectAlerts: number[];
  finishCallErrors: number;
}> = ({ areas, correctAlerts, incorrectAlerts, finishCallErrors }) => {
  const { CORRECT_ALERT_POINTS, INCORRECT_ALERT_PENALTY, FINISH_CALL_ERROR_PENALTY } =
    NATIONALS_SCORING;
  const finishDeduction = finishCallErrors * FINISH_CALL_ERROR_PENALTY;
  const rawTotal =
    areas.reduce(
      (pts, _area, i) =>
        pts +
        (correctAlerts[i] ?? 0) * CORRECT_ALERT_POINTS -
        (incorrectAlerts[i] ?? 0) * INCORRECT_ALERT_PENALTY,
      0
    ) - finishDeduction;
  return (
    <div className="space-y-1">
      <div className="text-sm font-medium text-muted-foreground">Area Breakdown</div>
      <div className="grid gap-1">
        {areas.map((area, i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-1.5 text-sm"
          >
            <span className="font-medium">{area.areaName}</span>
            <div className="flex items-center gap-3">
              <span className="font-mono">{area.time || '--:--'}</span>
              <span className="text-green-600">
                +{(correctAlerts[i] ?? 0) * CORRECT_ALERT_POINTS}
              </span>
              {(incorrectAlerts[i] ?? 0) > 0 && (
                <span className="text-red-600">
                  -{(incorrectAlerts[i] ?? 0) * INCORRECT_ALERT_PENALTY}
                </span>
              )}
            </div>
          </div>
        ))}
        {finishCallErrors > 0 && (
          <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-1.5 text-sm">
            <span className="font-medium">Finish call errors ({finishCallErrors})</span>
            <span className="text-red-600">-{finishDeduction}</span>
          </div>
        )}
        {rawTotal < 0 && (
          <div className="px-3 py-1 text-xs text-muted-foreground">
            These add up to {rawTotal}; a run never scores below 0.
          </div>
        )}
      </div>
    </div>
  );
};
