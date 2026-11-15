import React from 'react';
import { NATIONALS_SCORING } from '@myk9/core';
import type { AreaScore } from '../../../types';

/** The per-area read-back on the Nationals Score Confirmation. */
export const NationalsAreaBreakdown: React.FC<{
  areas: AreaScore[];
  correctAlerts: number[];
  incorrectAlerts: number[];
}> = ({ areas, correctAlerts, incorrectAlerts }) => (
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
              +{(correctAlerts[i] ?? 0) * NATIONALS_SCORING.CORRECT_ALERT_POINTS}
            </span>
            {(incorrectAlerts[i] ?? 0) > 0 && (
              <span className="text-red-600">
                -{(incorrectAlerts[i] ?? 0) * NATIONALS_SCORING.INCORRECT_ALERT_PENALTY}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  </div>
);
