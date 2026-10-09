/**
 * CompletedResult — right-hand column of a scored row (MYK9-1086).
 *
 * Qualified: placement ribbon (or "Q"), time, and the fault count only when
 * there is at least one. NQ, excused and absent: the result and its reason
 * only — no time, no faults. Every field respects its release flag
 * (`showPlacement` / `showQualification` / `showTime` / `showFaults`).
 */

import React from 'react';
import { formatTimeForDisplay } from '@myk9/core';
import type { Entry } from '../../stores/entryStore';
import { getPlacementText, normalizeResultText } from './sortableEntryCardUtils';
import { getRibbonColor } from './ribbonColors';

function reasonFor(entry: Entry, code: string): string | null {
  if (code === 'NQ') return entry.nqReason || null;
  if (code === 'EX') return entry.excusedReason ? `Excused · ${entry.excusedReason}` : 'Excused';
  if (code === 'ABS') return 'Absent';
  if (code === 'WD')
    return entry.withdrawnReason ? `Withdrawn · ${entry.withdrawnReason}` : 'Withdrawn';
  return null;
}

export const CompletedResult: React.FC<{ entry: Entry; registry?: string | null }> = ({
  entry,
  registry,
}) => {
  const code = normalizeResultText(entry.resultText);
  const qualified = code === 'Q';
  const showQual = entry.showQualification !== false;
  const placement = entry.placement ?? 0;
  const showPlace = qualified && entry.showPlacement !== false && placement > 0;
  const faults = entry.faultCount ?? 0;
  const reason = showQual && !qualified ? reasonFor(entry, code) : null;

  let badge: React.ReactNode = null;
  if (showPlace) {
    const ribbon = getRibbonColor(registry, placement);
    badge = (
      <span
        data-testid="placement-ribbon"
        className="rounded-full px-2 py-0.5 text-xs font-bold"
        style={{
          background: ribbon.background,
          color: ribbon.text,
          border: `1.5px solid ${ribbon.outline}`,
        }}
      >
        {getPlacementText(placement)}
      </span>
    );
  } else if (showQual && entry.resultText) {
    badge = (
      <span
        className={
          qualified ? 'text-sm font-bold text-success' : 'text-sm font-bold text-muted-foreground'
        }
      >
        {code}
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-0.5 text-right" data-testid="completed-result">
      {badge}
      {qualified && entry.showTime !== false && entry.searchTime ? (
        <span className="text-[0.9375rem] font-semibold tabular-nums text-foreground">
          {formatTimeForDisplay(entry.searchTime)}
        </span>
      ) : null}
      {qualified && entry.showFaults !== false && faults > 0 ? (
        <span className="text-sm font-semibold text-warning">
          {faults === 1 ? '1 fault' : `${faults} faults`}
        </span>
      ) : null}
      {reason ? (
        <span className="text-sm font-semibold text-muted-foreground">{reason}</span>
      ) : null}
    </div>
  );
};
