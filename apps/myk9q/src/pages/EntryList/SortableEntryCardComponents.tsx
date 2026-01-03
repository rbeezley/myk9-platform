/**
 * SortableEntryCard Sub-Components
 *
 * Extracted from SortableEntryCard.tsx (DEBT-008) to reduce complexity.
 * Contains React sub-components for result badges and status display.
 */

import React from 'react';
import { Circle, Check, AlertTriangle, XCircle, Star, Bell, Target, Clock } from 'lucide-react';
import { Entry } from '../../stores/entryStore';
import { formatTimeForDisplay } from '../../utils/timeUtils';
import {
  normalizeResultText,
  getResultClassName,
  isNonQualifyingResult,
  getPlacementEmoji,
  getPlacementText,
  getStatusConfig,
  isNationalsCompetition,
  getDisplayTime
} from './sortableEntryCardUtils';

// ========================================
// PLACEMENT BADGE
// ========================================

interface PlacementBadgeProps {
  placement: number;
  showIcon?: boolean;
}

export const PlacementBadge: React.FC<PlacementBadgeProps> = ({
  placement,
  showIcon = true
}) => (
  <span className={`placement-badge place-${Math.min(placement, 5)}`}>
    {showIcon && placement <= 4 && (
      <span className="placement-badge-icon">{getPlacementEmoji(placement)}</span>
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
  <div className="nationals-scoresheet-improved">
    {/* Header Row: Placement, Time, and Result badges */}
    <div className="nationals-header-row">
      {entry.showPlacement !== false && (entry.placement ?? 0) > 0 && (
        <PlacementBadge placement={entry.placement!} />
      )}
      {entry.showTime !== false && (
        <span className="time-badge">{getDisplayTime(entry.searchTime, entry.resultText, formatTimeForDisplay)}</span>
      )}
      {entry.showQualification !== false && (
        <span className={`result-badge ${getResultClassName(entry.resultText)}`}>
          {normalizeResultText(entry.resultText)}
        </span>
      )}
    </div>

    {/* Stats Grid: 2x2 for Calls and Faults */}
    <div className="nationals-stats-grid">
      <div className="nationals-stat-item">
        <span className="nationals-stat-label">Correct</span>
        <span className="nationals-stat-value">{entry.correctFinds || 0}</span>
      </div>
      <div className="nationals-stat-item">
        <span className="nationals-stat-label">Incorrect</span>
        <span className="nationals-stat-value">{entry.incorrectFinds || 0}</span>
      </div>
      {entry.showFaults !== false && (
        <div className="nationals-stat-item">
          <span className="nationals-stat-label">Faults</span>
          <span className="nationals-stat-value">{entry.faultCount || 0}</span>
        </div>
      )}
      <div className="nationals-stat-item">
        <span className="nationals-stat-label">No Finish</span>
        <span className="nationals-stat-value">{entry.noFinishCount || 0}</span>
      </div>
    </div>

    {/* Total Points Row */}
    <div className="nationals-total-points-improved">
      <span className="nationals-total-label">Total Points</span>
      <span className={`nationals-total-value ${(entry.totalPoints || 0) >= 0 ? 'positive' : 'negative'}`}>
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
    <div className="regular-scoresheet-single-line">
      {showPlacement && entry.placement && (
        <PlacementBadge placement={entry.placement} />
      )}

      {entry.showQualification !== false && entry.resultText && (
        <span className={`result-badge ${getResultClassName(entry.resultText)}`}>
          {normalizeResultText(entry.resultText)}
        </span>
      )}

      {entry.showTime !== false && (
        <span className="time-badge">
          <Clock size={14} className="badge-icon" />
          {getDisplayTime(entry.searchTime, entry.resultText, formatTimeForDisplay)}
        </span>
      )}

      {entry.showFaults !== false && (
        <span className="faults-badge-subtle">
          <AlertTriangle size={14} className="badge-icon" />
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
        return <Target size={18} className="status-icon" style={iconStyle} />;
      case 'check':
        return <Check size={18} className="status-icon" style={iconStyle} />;
      case 'alert-triangle':
        return <AlertTriangle size={18} className="status-icon" style={iconStyle} />;
      case 'x-circle':
        return <XCircle size={18} className="status-icon" style={iconStyle} />;
      case 'star':
        return <Star size={18} className="status-icon" style={iconStyle} />;
      case 'bell':
        return <Bell size={18} className="status-icon" style={iconStyle} />;
      case 'circle':
        return <Circle size={18} className="status-icon" style={iconStyle} />;
      default:
        return null;
    }
  };

  return (
    <>
      {getIcon()}
      <span className="status-text">{config.text}</span>
    </>
  );
};
