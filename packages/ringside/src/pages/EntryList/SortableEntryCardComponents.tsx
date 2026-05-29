/**
 * SortableEntryCard Sub-Components
 *
 * Extracted from SortableEntryCard.tsx (DEBT-008) to reduce complexity.
 * Contains React sub-components for result badges and status display.
 *
 * PR E2d-2a — moved from apps/myk9q to @myk9/ringside. The host's
 * timeUtils re-export was a pass-through to @myk9/core, so this file
 * imports `formatTimeForDisplay` from `@myk9/core` directly. No host
 * coupling remains.
 */

import React from 'react';
import { Circle, Check, AlertTriangle, XCircle, Star, Bell, Target, Clock } from 'lucide-react';
import { cn } from '@myk9/ui';
import { formatTimeForDisplay } from '@myk9/core';
import { Entry } from '../../stores/entryStore';
import {
  normalizeResultText,
  isNonQualifyingResult,
  getPlacementEmoji,
  getPlacementText,
  getStatusConfig,
  isNationalsCompetition,
  getDisplayTime,
} from './sortableEntryCardUtils';

// ========================================
// SHARED BADGE CLASSES
// Tailwind ports of the result-badge layout that lived in myK9Q's
// EntryList.css (never in ringside.css). Colors resolve from the host's
// status/theme tokens (light + dark aware).
// ========================================

/** Pill shape for the qualification badge (was `.result-badge`). */
const RESULT_BADGE_BASE =
  'inline-flex min-h-[1.375rem] max-w-[100px] items-center justify-center overflow-hidden text-ellipsis whitespace-nowrap rounded-xl px-2.5 py-[0.3125rem] text-xs font-bold uppercase leading-none tracking-wide';

/**
 * Per-result fill (was `.result-badge.<result>` color rules). Keyed on the
 * leading token of the result text, so free-form values like "NQ - No Find" or
 * "Q - 1st" still color correctly (the old CSS matched the `.nq` / `.q` token
 * in the space-separated className; an exact lookup on the whole string would
 * silently fall through to muted). Mirrors getStatusBorderClass's tokens.
 */
const RESULT_BADGE_COLOR: Record<string, string> = {
  q: 'bg-status-checked-in text-white',
  qualified: 'bg-status-checked-in text-white',
  nq: 'bg-red-600 text-white',
  'non-qualifying': 'bg-red-600 text-white',
  ex: 'bg-red-600 text-white',
  excused: 'bg-red-600 text-white',
  abs: 'bg-violet-600 text-white',
  absent: 'bg-violet-600 text-white',
  e: 'bg-violet-600 text-white',
  wd: 'bg-violet-600 text-white',
  withdrawn: 'bg-violet-600 text-white',
};

/** First whitespace-delimited token, lowercased ("NQ - No Find" → "nq"). */
function resultHead(resultText: string | null | undefined): string {
  return (resultText ?? '').toLowerCase().trim().split(/\s+/)[0] ?? '';
}

function resultBadgeClass(resultText: string | null | undefined): string {
  return cn(RESULT_BADGE_BASE, RESULT_BADGE_COLOR[resultHead(resultText)] ?? 'bg-muted text-foreground');
}

/** Outlined chip used by time / faults / placement (was `.time-badge` etc.). */
const CHIP_BASE =
  'inline-flex items-center gap-1 rounded-xl border border-border bg-muted px-2.5 py-1 leading-none';
const TIME_BADGE = `${CHIP_BASE} text-xs font-semibold text-foreground`;
const FAULTS_BADGE = `${CHIP_BASE} text-[0.6875rem] font-medium text-muted-foreground`;
const PLACEMENT_BADGE = `${CHIP_BASE} text-sm font-bold text-foreground`;
const BADGE_ICON = 'shrink-0 opacity-70';

// ========================================
// PLACEMENT BADGE
// ========================================

interface PlacementBadgeProps {
  placement: number;
  showIcon?: boolean;
}

export const PlacementBadge: React.FC<PlacementBadgeProps> = ({
  placement,
  showIcon = true,
}) => (
  <span className={PLACEMENT_BADGE}>
    {showIcon && placement <= 4 && (
      <span className="text-lg leading-none">{getPlacementEmoji(placement)}</span>
    )}
    <span>{getPlacementText(placement)}</span>
  </span>
);

// ========================================
// NATIONALS RESULT BADGES
// ========================================

interface NationalsResultBadgesProps {
  entry: Entry;
}

export const NationalsResultBadges: React.FC<NationalsResultBadgesProps> = ({ entry }) => (
  <div className="flex w-full flex-col gap-2 border-t border-border pt-2">
    {/* Header Row: Placement, Time, and Result badges */}
    <div className="flex flex-wrap items-center gap-2">
      {entry.showPlacement !== false && (entry.placement ?? 0) > 0 && (
        <PlacementBadge placement={entry.placement!} />
      )}
      {entry.showTime !== false && (
        <span className={TIME_BADGE}>{getDisplayTime(entry.searchTime, entry.resultText, formatTimeForDisplay)}</span>
      )}
      {entry.showQualification !== false && (
        <span className={resultBadgeClass(entry.resultText)}>
          {normalizeResultText(entry.resultText)}
        </span>
      )}
    </div>

    {/* Stats Grid: 2x2 for Calls and Faults */}
    <div className="grid grid-cols-2 gap-2">
      <div className="flex items-center justify-between rounded-lg border border-border bg-muted px-2 py-1">
        <span className="text-[0.6875rem] text-muted-foreground">Correct</span>
        <span className="text-sm font-bold text-foreground">{entry.correctFinds || 0}</span>
      </div>
      <div className="flex items-center justify-between rounded-lg border border-border bg-muted px-2 py-1">
        <span className="text-[0.6875rem] text-muted-foreground">Incorrect</span>
        <span className="text-sm font-bold text-foreground">{entry.incorrectFinds || 0}</span>
      </div>
      {entry.showFaults !== false && (
        <div className="flex items-center justify-between rounded-lg border border-border bg-muted px-2 py-1">
          <span className="text-[0.6875rem] text-muted-foreground">Faults</span>
          <span className="text-sm font-bold text-foreground">{entry.faultCount || 0}</span>
        </div>
      )}
      <div className="flex items-center justify-between rounded-lg border border-border bg-muted px-2 py-1">
        <span className="text-[0.6875rem] text-muted-foreground">No Finish</span>
        <span className="text-sm font-bold text-foreground">{entry.noFinishCount || 0}</span>
      </div>
    </div>

    {/* Total Points Row */}
    <div className="flex items-center justify-between rounded-lg border border-border bg-muted px-3 py-2">
      <span className="text-xs font-semibold text-muted-foreground">Total Points</span>
      <span className={cn('text-base font-bold', (entry.totalPoints || 0) >= 0 ? 'text-status-checked-in' : 'text-red-600')}>
        {(entry.totalPoints || 0) >= 0 ? '+' : ''}{entry.totalPoints || 0}
      </span>
    </div>
  </div>
);

// ========================================
// REGULAR RESULT BADGES
// ========================================

interface RegularResultBadgesProps {
  entry: Entry;
}

export const RegularResultBadges: React.FC<RegularResultBadgesProps> = ({ entry }) => {
  // Only show if entry is scored (removed searchTime check - NQ entries may not have time)
  if (!entry.isScored) return null;

  const showPlacement =
    entry.showPlacement !== false &&
    (entry.placement ?? 0) > 0 &&
    !isNonQualifyingResult(entry.resultText);

  return (
    <div className="flex w-full flex-wrap items-center gap-2 border-t border-border pt-2">
      {showPlacement && entry.placement && (
        <PlacementBadge placement={entry.placement} />
      )}

      {entry.showQualification !== false && entry.resultText && (
        <span className={resultBadgeClass(entry.resultText)}>
          {normalizeResultText(entry.resultText)}
        </span>
      )}

      {entry.showTime !== false && (
        <span className={TIME_BADGE}>
          <Clock size={14} className={BADGE_ICON} />
          {getDisplayTime(entry.searchTime, entry.resultText, formatTimeForDisplay)}
        </span>
      )}

      {entry.showFaults !== false && (
        <span className={FAULTS_BADGE}>
          <AlertTriangle size={14} className={BADGE_ICON} />
          {entry.faultCount || 0} {entry.faultCount === 1 ? 'Fault' : 'Faults'}
        </span>
      )}
    </div>
  );
};

// ========================================
// RESULT BADGES (MAIN ENTRY POINT)
// ========================================

interface ResultBadgesProps {
  entry: Entry;
  showContext?: { competition_type?: string } | null;
}

export const ResultBadges: React.FC<ResultBadgesProps> = ({ entry, showContext }) => {
  if (!entry.isScored) return null;

  if (isNationalsCompetition(showContext)) {
    return <NationalsResultBadges entry={entry} />;
  }

  return <RegularResultBadges entry={entry} />;
};

// ========================================
// STATUS BADGE CONTENT
// ========================================

interface StatusBadgeContentProps {
  status: string | null | undefined;
}

const iconStyle = { width: '18px', height: '18px', flexShrink: 0 } as const;

export const StatusBadgeContent: React.FC<StatusBadgeContentProps> = ({ status }) => {
  const config = getStatusConfig(status);

  const getIcon = () => {
    switch (config.iconName) {
      case 'target':
        return <Target size={18} style={iconStyle} />;
      case 'check':
        return <Check size={18} style={iconStyle} />;
      case 'alert-triangle':
        return <AlertTriangle size={18} style={iconStyle} />;
      case 'x-circle':
        return <XCircle size={18} style={iconStyle} />;
      case 'star':
        return <Star size={18} style={iconStyle} />;
      case 'bell':
        return <Bell size={18} style={iconStyle} />;
      case 'circle':
        return <Circle size={18} style={iconStyle} />;
      default:
        return null;
    }
  };

  return (
    <>
      {getIcon()}
      <span className="min-w-0 shrink overflow-hidden text-ellipsis text-[0.6875rem] leading-tight normal-case">{config.text}</span>
    </>
  );
};
